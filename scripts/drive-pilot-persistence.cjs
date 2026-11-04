// Bounded pilot persistence; no schema changes, queue dispatch or provider calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
module.exports=async function persist({db,config,media,api,accountId,owner,fileId,metadata,remote,source,checksum,analysis,transcript,usage}){
  const {LocalEmbeddingService}=require(path.join(api,'src/modules/pipeline/local-embedding.service'));
  const {resolveFromRepo}=require(path.join(api,'src/common/repo-paths'));
  const {toStorageLocator}=require(path.join(api,'src/common/storage-paths'));
  const storageRoot=resolveFromRepo(config.get('STORAGE_ROOT','./storage'));
  const locator=file=>toStorageLocator(file,storageRoot);
  const embedder=new LocalEmbeddingService(config);
  const asset='vid_pilot_'+createHash('sha256').update(JSON.stringify([owner,accountId,fileId,checksum])).digest('hex').slice(0,32);
  const directory=path.join(storageRoot,'pilot-media',asset);fs.mkdirSync(directory,{recursive:true});
  const retained=path.join(directory,'source.mp4');fs.copyFileSync(source,retained);
  const segments=[];
  try{
    for(const [index,segment] of analysis.segments.entries()){
      const cueText=transcript.filter(c=>c.start_time<segment.end_time&&c.end_time>segment.start_time).map(c=>c.text).join(' ');
      const frame=path.join(directory,`frame-${index}.jpg`),timestamp=(segment.start_time+segment.end_time)/2;
      await media.extractInspectionFrame(source,frame,timestamp);
      const text=[segment.title,segment.description,...segment.visual_objects,...segment.actions,cueText].filter(Boolean).join('. ');
      const embedding=await embedder.generateEmbedding(text);assert.equal(embedding.values.length,384);
      segments.push({...segment,id:asset+'_seg_'+String(index+1).padStart(3,'0'),cueText,frame,timestamp,embedding:embedding.values});
    }
    const thumbnail=segments[0].frame;
    // Expensive I/O/inference happens before this short atomic, owner-checked transaction.
    await db.query('BEGIN');
    try{
      await db.query("SET LOCAL statement_timeout='10s'");
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[accountId+':'+fileId]);
      const account=await db.query('SELECT user_id FROM connector_accounts WHERE id=$1 AND user_id=$2 FOR SHARE',[accountId,owner]);assert.equal(account.rowCount,1,'Owner changed');
      const corpus=await db.query('SELECT count(*)::int AS count FROM media_segments WHERE user_id=$1 AND embedding IS NOT NULL',[owner]);assert.equal(corpus.rows[0].count,0,'Pilot cannot change an owner with existing Google vectors');
      const previous=await db.query('SELECT id FROM media_assets WHERE user_id=$1 AND external_file_id=$2 AND id<>$3',[owner,fileId,asset]);assert.equal(previous.rowCount,0,'Existing source requires normal reindex, not pilot overwrite');
      await db.query(`INSERT INTO media_assets(id,user_id,source_type,original_filename,checksum,file_size,duration,width,height,fps,codec,has_audio,status,stage,progress,proxy_path,proxy_status,original_path,thumbnail_path,thumbnail_data,external_file_id,connector_account_id,drive_modified_time,scene_count,frames_analyzed,cost_usd,indexed_at)
        VALUES($1,$2,'google_drive',$3,$4,$5,$6,$7,$8,$9,$10,$11,'indexed','completed',100,$12,'ready','',$13,$14,$15,$16,$17,$18,0,$19,NOW())
        ON CONFLICT(id) DO UPDATE SET proxy_path=EXCLUDED.proxy_path,thumbnail_path=EXCLUDED.thumbnail_path,thumbnail_data=EXCLUDED.thumbnail_data,status='indexed',stage='completed',progress=100,updated_at=NOW() WHERE media_assets.user_id=EXCLUDED.user_id`,
        [asset,owner,remote.name,checksum,remote.size,metadata.duration,metadata.width,metadata.height,Math.round(metadata.fps),metadata.codec,metadata.hasAudio,locator(retained),locator(thumbnail),'data:image/jpeg;base64,'+fs.readFileSync(thumbnail).toString('base64'),fileId,accountId,remote.modifiedTime,segments.length,usage.estimatedUsd]);
      for(const s of segments)await db.query(`INSERT INTO media_segments(id,asset_id,user_id,start_time,end_time,title,description,visual_objects,actions,transcript_text,keyframe_path,keyframe_paths,sources,provider,model,embedding_384,embedding_dim)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,'baseten',$14,$15::vector,384)
        ON CONFLICT(id) DO UPDATE SET embedding_384=EXCLUDED.embedding_384,transcript_text=EXCLUDED.transcript_text,keyframe_path=EXCLUDED.keyframe_path,keyframe_paths=EXCLUDED.keyframe_paths WHERE media_segments.user_id=EXCLUDED.user_id`,
        [s.id,asset,owner,s.start_time,s.end_time,s.title,s.description,s.visual_objects,s.actions,s.cueText,locator(s.frame),JSON.stringify([{timestamp:s.timestamp,path:locator(s.frame)}]),s.cueText?['baseten_video','transcript']:['baseten_video'],usage.model,'['+s.embedding.join(',')+']']);
      // Repeatable replacement is limited to this exact owner/source and profile.
      await db.query("DELETE FROM media_observations WHERE asset_id=$1 AND user_id=$2 AND observation_type IN ('pilot_video','pilot_transcript')",[asset,owner]);
      await db.query("INSERT INTO media_observations(asset_id,user_id,observation_type,timestamp_start,timestamp_end,raw_data) VALUES($1,$2,'pilot_video',0,$3,$4::jsonb)",[asset,owner,metadata.duration,JSON.stringify({analysis,usage,profile:'native-video-local-speech-v1',embeddingModel:'sentence-transformers/all-MiniLM-L6-v2',frameOcr:false})]);
      for(const cue of transcript)await db.query("INSERT INTO media_observations(asset_id,user_id,observation_type,timestamp_start,timestamp_end,raw_data) VALUES($1,$2,'pilot_transcript',$3,$4,$5::jsonb)",[asset,owner,cue.start_time,cue.end_time,JSON.stringify(cue)]);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
    fs.writeFileSync('storage/drive-pilot-latest.json',JSON.stringify({asset,owner,accountId,fileId,segments:segments.length},null,2));
    return {segments:segments.length,embeddingDimensions:384,profile:'native-video-local-speech-v1',retainedPlaybackCopy:true,frameOcr:false};
  }finally{await embedder.onModuleDestroy();}
};
