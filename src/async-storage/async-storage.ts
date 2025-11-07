import { AsyncLocalStorage } from "async_hooks";
import { Request } from "express";
import _ from "lodash";

export interface ALSConfig {
  request: Request;
  requestId: string;
  requestIp: string;
}

export const ASLStore = new AsyncLocalStorage<ALSConfig>();

export const AlsGetRequest = (): Request => {
  const store = ASLStore.getStore();
  if (!store) {
    return {} as Request;
  }
  return store.request;
};

export const AlsSetRequest = (data: Request): ALSConfig => {
  const store = ASLStore.getStore() || {} as ALSConfig;
  return _.set(store, "request", data);
};

export const AlsSetRequestId = (requestId: string): ALSConfig => {
  const store = ASLStore.getStore() || {} as ALSConfig;
  return _.set(store, "requestId", requestId);
};

export const AlsGetRequestId = (): string => {
  const store = ASLStore.getStore();
  return _.get(store, "requestId", "system");
};

export const AlsSetRequestIp = (ip: string): ALSConfig => {
  const store = ASLStore.getStore() || {} as ALSConfig;
  return _.set(store, "requestIp", ip);
};

export const AlsGetRequestIp = (): string => {
  const store = ASLStore.getStore();
  return _.get(store, "requestIp", "");
};