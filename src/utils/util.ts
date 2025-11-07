import _ from "lodash";
import crypto from 'crypto';

export function getErrMsg(e: Error): string {
  return e?.message || JSON.stringify(e);
}

export async function Sleep(seconds: number): Promise<void> {
  await new Promise((ok) => {
    setTimeout(ok, seconds * 1e3);
  });
}

export async function SleepMS(ms: number): Promise<void> {
  await new Promise((ok) => {
    setTimeout(ok, ms);
  });
}

export async function DestructureAllSettled(
  promises: Array<Promise<any>>,
  limit = 20
) {
  const result: { fulfilled: any[]; rejected: any[] } = {
    fulfilled: [],
    rejected: [],
  };
  if (!promises.length) {
    return result;
  }

  const promisesCopy = promises.slice(0);
  do {
    const stepItems = promisesCopy.splice(0, limit);
    const res = await Promise.allSettled(stepItems);
    result.fulfilled.push(
      ..._.flatten(
        res
          .filter((result) => result.status === "fulfilled")
          .map((result: any) => result.value)
      )
    );
    result.rejected.push(
      ..._.flatten(
        res
          .filter((result) => result.status === "rejected")
          .map((result: any) => result.reason)
      )
    );
    await SleepMS(100);
  } while (promisesCopy.length);

  return result;
}

export function Md5(str: string | Buffer, key?: string): string {
  if (typeof str === "string") {
    str = Buffer.from(str);
  }

  let enc: crypto.Hmac | crypto.Hash;
  if (key) {
    enc = crypto.createHmac("md5", key);
  } else {
    enc = crypto.createHash("md5");
  }

  enc.update(str);
  return enc.digest("hex") as string;
}

export function Eval(context: any, expression: string, value?: string) {
  const exp = expression.replace(/@var:/g, "Context.");
  const evalValue = new Function(
    "Context",
    "_",
    "value",
    "util",
    `return ${exp} || value;`
  )(context, _, value, { Md5 });

  return evalValue;
}

export function getRandomStr(size: number): string {
  let str = '';
  if (size > 100) {
    return str;
  }
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < size; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    str += charset[randomIndex];
  }
  return str;
}
