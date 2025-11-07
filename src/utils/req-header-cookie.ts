import {Request} from "express";

export interface ICookies {
  [key: string]: string;
}

export function parse(cookieString): ICookies {
  if (!cookieString) {
    return {};
  }

  const cookies: ICookies = {};
  const arr = cookieString.split(/; /g);
  arr.forEach((str) => {
    const pair = str.split("=");
    cookies[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
  });
  return cookies;
}

export function stringify(cookies: ICookies): string {
  return Object.keys(cookies)
    .map((key) =>
      [encodeURIComponent(key), encodeURIComponent(cookies[key])].join("="),
    )
    .join("; ");
}

export function get(req: Request): ICookies | null {
  const header = req.headers.cookie;
  if (header) {
    return parse(header);
  }
  return null;
}

export function remove(req: Request, name: string) {
  const cookies = get(req);
  if (cookies) {
    delete cookies[name];
    req.headers.cookie = stringify(cookies);
  }
}
