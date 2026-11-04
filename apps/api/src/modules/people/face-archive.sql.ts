// Owner-scoped fingerprint of the exact newest manual reference pool. Accepted
// suggestions never feed training. Source edits/deletions invalidate queued work.
export const competitorReferencesSql=`SELECT id,asset_id,frame_s,box,version,checksum FROM (SELECT r.id,r.asset_id,r.frame_s,r.box,r.updated_at::text AS version,a.checksum,row_number() OVER(PARTITION BY r.person_id ORDER BY r.updated_at DESC,r.id) AS rank FROM person_appearances r JOIN media_assets a ON a.id=r.asset_id AND a.user_id=r.user_id WHERE r.user_id=$1 AND r.person_id!=$2 AND r.origin='manual' AND r.status='confirmed' AND r.end_s<=a.duration AND (a.availability IS NULL OR a.availability!='offline')) c WHERE rank<=2 ORDER BY rank,id LIMIT 12`;
export const referenceRevisionSql=`WITH rivals AS (${competitorReferencesSql}) SELECT md5(COALESCE(string_agg(concat_ws('|',r.id,r.updated_at::text,r.asset_id,r.frame_s,r.box::text,a.checksum),';' ORDER BY r.updated_at DESC,r.id),'')||'/'||COALESCE((SELECT string_agg(concat_ws('|',id,version,checksum),';' ORDER BY id) FROM rivals),'')) AS revision,count(*)::int AS count
 FROM (SELECT * FROM person_appearances WHERE user_id=$1 AND person_id=$2 AND origin='manual' AND status='confirmed' ORDER BY updated_at DESC,id LIMIT 30) r
 JOIN media_assets a ON a.id=r.asset_id AND a.user_id=r.user_id
 WHERE r.end_s<=a.duration AND a.checksum IS NOT NULL AND (a.availability IS NULL OR a.availability!='offline')`;

export const archiveProfile='yunet-sface-context-v2-tiles4-t065-60s';

export const discoverArchiveSql=`SELECT a.id,a.checksum,a.duration,g.start_s,LEAST(a.duration,g.start_s+60) AS end_s
 FROM media_assets a CROSS JOIN LATERAL generate_series(0,(ceil(a.duration/60)::int-1)*60,60) g(start_s)
 WHERE a.user_id=$1 AND a.status='indexed' AND a.duration>0 AND a.duration<=604800
 AND a.checksum IS NOT NULL AND a.checksum!='' AND a.original_filename ~* '\\.(mp4|mov|webm|mkv|avi|m4v)$'
 AND (a.availability IS NULL OR a.availability!='offline')
 AND NOT EXISTS(SELECT 1 FROM face_archive_jobs blocked WHERE blocked.user_id=$1 AND blocked.person_id=$2 AND blocked.asset_id=a.id AND blocked.asset_checksum=a.checksum AND blocked.reference_revision=$3 AND blocked.profile=$4 AND blocked.state='blocked' AND blocked.error_code='preview_too_large')
 AND NOT EXISTS(SELECT 1 FROM face_archive_jobs j WHERE j.user_id=$1 AND j.person_id=$2 AND j.asset_id=a.id AND j.asset_checksum=a.checksum AND j.reference_revision=$3 AND j.profile=$4 AND j.start_s=g.start_s)
 ORDER BY a.created_at,a.id,g.start_s LIMIT 16`;

export const claimArchiveSql=`UPDATE face_archive_jobs j SET state='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '10 minutes',updated_at=now()
 WHERE j.id=(SELECT q.id FROM face_archive_jobs q JOIN face_archive_settings s ON s.user_id=q.user_id AND s.person_id=q.person_id
 WHERE s.enabled AND q.state='queued' AND q.next_attempt_at<=now() AND q.profile=$2
 ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED) RETURNING j.*`;
