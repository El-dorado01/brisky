import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { apiContract, ApiContractController } from './api-contract';
import { MediaController } from '../modules/media/media.controller';
import { IndexingController } from '../modules/queue/indexing.controller';
import { AuthController } from '../modules/auth/auth.controller';
import { ConnectorsController } from '../modules/connector/connectors.controller';
import { HealthController } from '../modules/health/health.controller';
import { PeopleController } from '../modules/people/people.controller';
import { ConversationController } from '../modules/conversation/conversation.controller';
import { SaasConnectorsController } from '../modules/connector/saas-connectors.controller';
import {FaceMatchingController} from '../modules/people/face-matching.controller';
import {SaasPeopleController} from '../modules/people/saas-people.controller';
import {VoiceController} from '../modules/conversation/voice.controller';
import { readFileSync } from 'fs';
import { resolveFromRepo } from './repo-paths';

describe('OpenAPI inventory', () => {
  it('keeps the published artifact synchronized with the served contract', () => {
    expect(JSON.parse(readFileSync(resolveFromRepo('docs/openapi.json'), 'utf8'))).toEqual(apiContract);
  });
  it('documents every current controller route with the expected HTTP method', () => {
    const seen = new Set<string>();
    for (const controller of [MediaController,IndexingController,AuthController,ConnectorsController,HealthController,ApiContractController,PeopleController,ConversationController,SaasConnectorsController,FaceMatchingController,SaasPeopleController,VoiceController]) {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller) || '';
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const method = controller.prototype[name as keyof typeof controller.prototype];
        const verb = Reflect.getMetadata(METHOD_METADATA, method);
        if (verb === undefined) continue;
        const suffix = Reflect.getMetadata(PATH_METADATA, method) || '';
        const path = ('/' + prefix + '/' + suffix).replace(/\/+/g, '/').replace(/\/$/, '').replace(/:([\w]+)/g, '{$1}');
        const operation = apiContract.paths[path]?.[RequestMethod[verb].toLowerCase()];
        expect({path,method:RequestMethod[verb].toLowerCase(),documented:!!operation}).toEqual({path,method:RequestMethod[verb].toLowerCase(),documented:true});
        expect(seen.has(operation.operationId)).toBe(false);
        seen.add(operation.operationId);
      }
    }
    expect(seen.size).toBe(Object.values(apiContract.paths).reduce((sum, methods) => sum + Object.keys(methods).length, 0));
  });
});
