import { initTracingWithProvider, TraceConfig } from "sf-nest-trace";
import { IncomingMessage } from "http";
import { config } from "./config";

const InitTracingWithProvider = () => {
  const traceConf = config().trace
    const traceConfig: TraceConfig = {
      ...traceConf,
      isTraceOn: +traceConf.isTraceOn,
      ignoreIncomingRequestHook: (request: IncomingMessage) => {
        const urls = ["/deploy/ready", "/deploy/live"];
        return urls.includes(request.url ?? "");
      },
    };
    return initTracingWithProvider(traceConfig);
};
export default InitTracingWithProvider;
