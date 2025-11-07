import { Injectable } from "@nestjs/common";
import { Logger } from "../../logger/logger";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { AlsGetRequestId } from "../../async-storage/async-storage";
import {
  CentralControlApiRes, CustomAxiosResponse, DeviceInfoRes,
  DistributeTasksDto, DistributeTasksRes, FileUploadRes, MultiUploadFileDto,
  UploadFileDto, StopTaskDto
} from "./central-control-api.dto";
import { getErrMsg } from "../../utils/util";
import { AxiosError } from "axios";

@Injectable()
export class CentralControlApiService {
  private readonly centralControlAddress: string;
  private readonly logger = new Logger(CentralControlApiService.name);

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.centralControlAddress = this.configService.get('centralControlAddress', '');
  }

  get headerRequestId() {
    return {'x-request-id': AlsGetRequestId()}
  }

  // 获取设备详情
  async deviceInfo(sn: string): Promise<CentralControlApiRes<DeviceInfoRes>> {
    const resp = await firstValueFrom<CustomAxiosResponse<DeviceInfoRes>>(
      this.httpService.post(`${this.centralControlAddress}/device/info`, {
        sn,
      }, {
          timeout: 5000, // 5s超时
          headers: {...this.headerRequestId}
        }
      )
    )
    .then(v => v.data)
    .catch((err: AxiosError) => {
      const errMsg = getErrMsg(err)
      const config = err.config
      this.logger.error('Request CentralControlApi Error. url: %s, body: %s, msg: %s', config?.url, config?.data, errMsg)
      // 这里统一处理网络请求错误，调用方不用try catch了
      return {code: 400, message: errMsg}
    })
    return resp;
  }

  // 上传文件到设备
  async uploadFile(data: UploadFileDto): Promise<CentralControlApiRes<FileUploadRes>> {
    const resp = await firstValueFrom<CustomAxiosResponse<FileUploadRes>>(
      this.httpService.post(`${this.centralControlAddress}/device/uploadFile`, data, {
          timeout: 30000, // 30s超时
          headers: {...this.headerRequestId}
        }
      )
    )
    .then(v => v.data)
    .catch((err: AxiosError) => {
      const errMsg = getErrMsg(err)
      const config = err.config
      this.logger.error('Request CentralControlApi Error. url: %s, body: %s, msg: %s', config?.url, config?.data, errMsg)
      // 这里统一处理网络请求错误，调用方不用try catch了
      return {code: 400, message: errMsg}
    })
    return resp;
  }

  // 批量上传文件到设备
  async uploadMultiFiles(data: MultiUploadFileDto): Promise<CentralControlApiRes<FileUploadRes>> {
    const resp = await firstValueFrom<CustomAxiosResponse<FileUploadRes>>(
      this.httpService.post(`${this.centralControlAddress}/device/uploadMultiFiles`, data, {
          timeout: 30000, // 30s超时
          headers: {...this.headerRequestId}
        }
      )
    )
    .then(v => v.data)
    .catch((err: AxiosError) => {
      const errMsg = getErrMsg(err)
      const config = err.config
      this.logger.error('Request CentralControlApi Error. url: %s, body: %s, msg: %s', config?.url, config?.data, errMsg)
      // 这里统一处理网络请求错误，调用方不用try catch了
      return {code: 400, message: errMsg}
    })
    return resp;
  }

  // 下发任务
  async distributeTasks(data: DistributeTasksDto): Promise<CentralControlApiRes<DistributeTasksRes>> {
    const endpoint = `${this.centralControlAddress}/device/task_start_single`;
    this.logger.info(`----------------request---------------`)
    this.logger.info("apiUrl ："+endpoint)
    this.logger.info("request：%j", data)
    const resp = await firstValueFrom<CustomAxiosResponse<DistributeTasksRes>>(
      this.httpService.post(endpoint, data, {
          timeout: 30000, // 30s超时
          headers: {...this.headerRequestId}
        }
      )
    )
    .then(v => v.data)
    .catch((err: AxiosError) => {
      const errMsg = getErrMsg(err)
      const config = err.config
      this.logger.error('Request CentralControlApi Error. url: %s, body: %s, msg: %s', config?.url, config?.data, errMsg)
      // 这里统一处理网络请求错误，调用方不用try catch了
      return {code: 400, message: errMsg}
    })
    return resp;
  }
  
  async stopTask(data: StopTaskDto) {
    return firstValueFrom<CustomAxiosResponse<any>>(
      this.httpService.post(`${this.centralControlAddress}/device/task_stop`, data, {
         timeout: 30000, // 30s超时
        headers: {...this.headerRequestId}
      }))
      .then(it => it.data)
      .catch((e: AxiosError) => {
        const errMsg = getErrMsg(e)
        const config = e.config
        this.logger.error('Request CentralControlApi Error. url: %s, body: %s, msg: %s', config?.url, config?.data, errMsg)
        // 这里统一处理网络请求错误，调用方不用try catch了
        return {code: 400, message: errMsg}
      })
  }

}