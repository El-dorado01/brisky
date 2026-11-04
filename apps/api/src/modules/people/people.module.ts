import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PeopleSearchService } from './people-search.service';
import { ConversationVerifierService } from './conversation-verifier.service';
import { PipelineModule } from '../pipeline/pipeline.module';
import { SaasPeopleController } from './saas-people.controller';
import { SaasSessionGuard } from '../conversation/saas-session.guard';

@Module({ imports:[PipelineModule], controllers: [PeopleController,SaasPeopleController], providers: [PeopleService, PeopleSearchService, ConversationVerifierService,SaasSessionGuard],
  exports: [PeopleService, PeopleSearchService, ConversationVerifierService] })
export class PeopleModule {}
