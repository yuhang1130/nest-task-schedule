import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CentralControlApiService } from "./central-control-api.service";


@Module({
  imports: [
    HttpModule,
    ConfigModule,
  ],
  providers: [CentralControlApiService],
  exports: [CentralControlApiService],
})
export class CentralControlApiModule { }