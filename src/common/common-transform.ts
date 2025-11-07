import { plainToClass, TransformFnParams } from 'class-transformer';

export const TransStr2Number = (o: TransformFnParams) => {
  const v = o?.value;
  if (Array.isArray(v)) {
    return v.map(Number);
  } else {
    return +v;
  }
};

export const TransAny2Str = (o: TransformFnParams) => {
  const v = o?.value;
  if (Array.isArray(v)) {
    return v.map(x => String(x).trim());
  } else {
    return String(v).trim();
  }
};

export const TransAny2Bool = (o: TransformFnParams) => {
  let v = o?.value;
  if (Array.isArray(v)) {
    return v.map(x => Boolean(x));
  } else if (typeof v === "string"){
    switch (v) {
      case "1":
      case "true":
        v = true;
        break;
      case "0":
      case "false":
      case "":
        v = false;
    }
    return v;
  } else {
    return !!v;
  }
};

export const TransSplitArr = (o: TransformFnParams) => {
  const v = o?.value;
  if (typeof v === 'string') {
    if (v === '') {
      return [];
    }
    return v.split(',');
  }

  return v;
};

export const TransAny2NumberArr = (o: TransformFnParams) => {
  const v = o?.value;
  let numArr;
  if (Array.isArray(v)) {
    numArr = v;
  } else if (typeof v === 'string') {
    numArr = v ? v.split(',') : [];
  } else {
    numArr = [v];
  }

  return numArr.map(Number);
};

export const TransString2Object = (o: TransformFnParams) => {
  const v = o?.value;
  try {
    return JSON.parse(v);
  } catch (err) {
    return v;
  }
};

export const TransString2Class = (Class: new(...args: any) => any) => {
  return (v) => {
    if (typeof v !== "string") {
      return v;
    }

    try {
      const plain = JSON.parse(v);
      return plainToClass(Class, plain);
    } catch (err) {
      return v;
    }
  };
};

export const TransBool2Number = (o: TransformFnParams) => {
  const v = o?.value;
  return !!v ? 1 : 0;
};
