import {Global, Module} from '@nestjs/common';
import {DatabaseModule} from './database/database.module';
import {ConfigModule} from '@nestjs/config';
import {HttpModule} from '@nestjs/axios';
import { MQModule } from './mq/mq.module';

process.on('unhandledRejection', error => {
  console.error('process.on unhandledRejection', error);
});

@Global()
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HttpModule,
    MQModule,
  ],
  providers: [],
  exports: [
    ConfigModule,
    DatabaseModule,
    HttpModule,
    MQModule,
  ],
})

export class GlobalModule {}
