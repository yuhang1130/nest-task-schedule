import { HttpException, HttpStatus } from "@nestjs/common";

export class CustomException extends HttpException {
  public code: number

  constructor(errCode: number, message: string) {
    super(
      { code: errCode, message: message || "Internal Server Error" },
      HttpStatus.OK,
    );
    this.code = errCode.valueOf();
  }
}
