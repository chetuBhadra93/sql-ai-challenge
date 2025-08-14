import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { DbService } from './db.service';
import { Nl2SqlService } from './nl2sql.service';
import { ReactAgentService } from './react-agent.service';

@Module({
  controllers: [QueryController],
  providers: [
    DbService, 
    Nl2SqlService, 
    ReactAgentService
  ],
})
export class AppModule {}