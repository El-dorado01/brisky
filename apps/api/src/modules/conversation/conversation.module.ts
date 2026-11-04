import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { SaasSessionGuard } from './saas-session.guard';
import { MomentThumbnailService } from '../media/moment-thumbnail.service';
import { FaceMatchingService } from '../people/face-matching.service';
import { FaceMatchingController } from '../people/face-matching.controller';
import {FaceArchiveService} from '../people/face-archive.service';
import {VoiceService} from './voice.service';
import {VoiceController} from './voice.controller';
import {LiveVoiceService} from './live-voice.service';
import {MmsSpeechService} from './mms-speech.service';
import {MmsSavedSpeechService} from './mms-saved-speech.service';
@Module({imports:[MediaModule,PipelineModule],controllers:[ConversationController,FaceMatchingController,VoiceController],providers:[ConversationService,SaasSessionGuard,MomentThumbnailService,FaceMatchingService,FaceArchiveService,VoiceService,LiveVoiceService,MmsSpeechService,MmsSavedSpeechService]})
export class ConversationModule{}
