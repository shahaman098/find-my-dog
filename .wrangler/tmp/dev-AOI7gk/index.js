var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var stripPathPrefix = /* @__PURE__ */ __name((rawPath, decodedPath, prefixLength) => {
  if (rawPath.at(-1) === "/" && decodedPath.at(-1) !== "/") rawPath = rawPath.slice(0, -1);
  let index = 0;
  for (let i = decodedPath.indexOf("/"); i !== -1 && i < prefixLength; i = decodedPath.indexOf("/", i + 1)) {
    index = rawPath.indexOf("/", index + 1);
    if (index === -1) return "/";
  }
  return rawPath.slice(index) || "/";
}, "stripPathPrefix");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => str.indexOf("%") !== -1 ? tryDecode(str, decodeURIComponent_) : str, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    const queryIndex = url.indexOf("?", 8);
    let keyIndex2 = queryIndex;
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61 || trailingKeyCode === 38 || isNaN(trailingKeyCode)) {
        if (keyIndex2 > queryIndex && /(?:^|&)[^=&]*[%+]/.test(url.slice(queryIndex + 1, keyIndex2))) break;
        if (trailingKeyCode === 61) {
          const valueIndex = keyIndex2 + key.length + 2;
          const endIndex = url.indexOf("&", valueIndex);
          return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
        }
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) str = str.toString();
    if (str instanceof Promise) str = await str;
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) return Promise.resolve(str);
  if (buffer) buffer[0] += str;
  else buffer = [str];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized && !this.#res.bodyUsed) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  }, "text");
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler = i === middleware.length && next || void 0;
      if (handler) try {
        res = await handler(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/utils/mount.js
var getPathPrefixLength = /* @__PURE__ */ __name((c, pathPrefix, routePath) => {
  if (!/[:*]/.test(pathPrefix)) return pathPrefix.length;
  const path = c.req.path;
  const matchResult = c.req[GET_MATCH_RESULT];
  const paramNames = /* @__PURE__ */ new Set();
  let length = 0;
  for (const part of splitRoutingPath(pathPrefix)) {
    const pattern = getPattern(part);
    if (pattern && pattern !== "*") {
      const name = pattern[1];
      if (paramNames.has(name)) throw new Error(`mount(): Duplicate path parameter "${name}" in "${routePath}".`);
      paramNames.add(name);
    }
    if (pattern && pattern !== "*" && pattern[2] !== true) {
      const value = matchResult.length === 2 ? matchResult[1][matchResult[0][c.req.routeIndex][1][pattern[1]]] : matchResult[0][c.req.routeIndex][1][pattern[1]];
      length += value.length + 1;
    } else if (pattern || part.endsWith("*")) {
      const end = path.indexOf("/", length + 1);
      length = end === -1 ? path.length : end;
    } else length += part.length + 1;
  }
  return length;
}, "getPathPrefixLength");
var createMountedRequest = /* @__PURE__ */ __name((c, pathPrefix, routePath) => {
  if (/[^/]\*$/.test(routePath)) throw new Error(`mount(): Wildcard must follow "/" in "${routePath}".`);
  const url = new URL(c.req.raw.url);
  url.pathname = stripPathPrefix(url.pathname, c.req.path, getPathPrefixLength(c, pathPrefix, routePath));
  return new Request(url, c.req.raw);
}, "createMountedRequest");

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class Hono2 {
  static {
    __name(this, "Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute("ALL", this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) handler = r.handler;
      else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    const mergedPath = mergePath(this._basePath, path);
    const defaultReplaceRequest = /* @__PURE__ */ __name((c) => createMountedRequest(c, mergedPath.replace(/\/$/, ""), mergePath(mergedPath, "*")), "defaultReplaceRequest");
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest ? replaceRequest(c.req.raw) : defaultReplaceRequest(c), ...getOptions(c));
      if (res) return res;
      await next();
    }, "handler");
    this.#addRoute("ALL", mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env, executionCtx);
  }, "request");
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = "[^]*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/[^]*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === "[^]*" || a === "(?:|/[^]*)") return b === "[^]*" ? -1 : 1;
  else if (b === "[^]*" || b === "(?:|/[^]*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class Node2 {
  static {
    __name(this, "Node");
  }
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, keys) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ONLY_WILDCARD_REG_EXP_STR
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (new RegExp(regexpStr).test("")) throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        keys.push(regexpStr);
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== "[^]*" && regexpStr !== "(?:|/[^]*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        keys.push(token);
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== "[^]*" && k !== "(?:|/[^]*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = index;
  }
  buildRegExpStr() {
    const strList = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList.unshift(`#${this.#index}`);
    if (strList.length === 0) return "";
    if (strList.length === 1) return strList[0];
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    const keys = [];
    if (isStatic) {
      this.#root.insert(path.split(""), -1, [], this.#context, keys);
      this.paths[path] = [
        -1,
        [],
        keys
      ];
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{(?:\{[\d,]+\}|[^}])+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./gs) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, keys);
    this.paths[path] = [
      this.#index++,
      paramAssoc,
      keys
    ];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
function endsWithWildcard(keys) {
  const tail = keys[keys.length - 1];
  return tail === "[^]*" || tail === "(?:|/[^]*)";
}
__name(endsWithWildcard, "endsWithWildcard");
function covers(wildcard, target) {
  const last = wildcard.length - 1;
  for (let i = 0; i < last; i++) if (wildcard[i] !== target[i]) return false;
  return wildcard[last] === "[^]*" || target.length === last || target[last] === "/";
}
__name(covers, "covers");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #handlers;
  #tries;
  constructor() {
    this.#handlers = { ["ALL"]: [] };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const handlers = this.#handlers;
    if (!handlers) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    const tries = this.#tries;
    if (!handlers[method]) {
      tries[method] = new Trie();
      handlers[method] = [...handlers["ALL"]];
      for (const p in tries["ALL"].paths) this.#insertPath(method, p);
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(handlers) : [method];
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!tries[m].paths[path2]) this.#insertPath(m, path2);
      handlers[m].push([handler, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#handlers)) matchers[method] = this.#buildMatcher(method);
    this.#handlers = this.#tries = void 0;
    return matchers;
  }
  #buildMatcher(method) {
    const handlers = this.#handlers[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    const own = createNullObject();
    const entries = handlers.map(([h, p], i) => {
      (own[p] ??= []).push(i);
      return [h, trie.paths[p][1].reduceRight((map, [key, varIndex]) => {
        map[key] = paramReplacementMap[varIndex];
        return map;
      }, createNullObject())];
    });
    const wildcards = Object.keys(own).filter((p) => endsWithWildcard(trie.paths[p][2]));
    for (const path in trie.paths) {
      const [index, , keys] = trie.paths[path];
      const indexes = [...own[path]];
      for (const p of wildcards) if (p !== path && covers(trie.paths[p][2], keys)) indexes.push(...own[p]);
      const data = indexes.sort((a, b) => a - b).map((i) => entries[i]);
      if (index === -1) {
        const last = Math.max(-1, ...data.flatMap(([, map]) => Object.values(map)));
        staticMap[path] = [data, last === -1 ? emptyParam : path.match(regexp).slice(0, last + 1)];
      } else handlerData[index] = data;
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  static {
    __name(this, "Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              if (!Object.hasOwn(params, name)) params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            if (!Object.hasOwn(params, name)) params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// worker/src/store.ts
var schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL)").run();
  schemaReady = true;
}
__name(ensureSchema, "ensureSchema");
async function createState(db, state) {
  await ensureSchema(db);
  await db.prepare("INSERT INTO reports (id, state, updated_at) VALUES (?, ?, ?)").bind(state.report_id, JSON.stringify(state), Date.now()).run();
}
__name(createState, "createState");
async function readState(db, reportId) {
  await ensureSchema(db);
  const row = await db.prepare("SELECT state FROM reports WHERE id = ?").bind(reportId).first();
  return row ? JSON.parse(row.state) : null;
}
__name(readState, "readState");
async function updateState(db, reportId, fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await readState(db, reportId);
    if (!state) throw new Error(`report ${reportId} not found`);
    fn(state);
    try {
      await db.prepare("UPDATE reports SET state = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(state), Date.now(), reportId).run();
      return state;
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
  throw new Error("unreachable");
}
__name(updateState, "updateState");

// worker/src/cost.ts
var PRICES = {
  sparkIn: 1.25 / 1e6,
  // $ per input token, muse-spark-1.3
  sparkOut: 4.25 / 1e6,
  samFrame: 0.2 / 1e3,
  // $ per billed frame (50-frame minimum per request)
  asrSecond: 0.18 / 3600,
  // $ per second of audio
  image: 0.01
};
function emptyCost() {
  return { sam_frames: 0, spark_in: 0, spark_out: 0, asr_seconds: 0, images: 0, usd: 0 };
}
__name(emptyCost, "emptyCost");
function computeUsd(c) {
  return c.sam_frames * PRICES.samFrame + c.spark_in * PRICES.sparkIn + c.spark_out * PRICES.sparkOut + c.asr_seconds * PRICES.asrSecond + c.images * PRICES.image;
}
__name(computeUsd, "computeUsd");
function addCost(s, delta) {
  for (const k of Object.keys(delta)) {
    if (delta[k]) s.cost[k] += delta[k];
  }
  s.cost.usd = Math.round(computeUsd(s.cost) * 1e3) / 1e3;
}
__name(addCost, "addCost");

// worker/src/sam.ts
var FRAME_RE = /<(\d+)f>/g;
var RECORD_RE = /(\d+)<\|box;x1=(-?\d+);y1=(-?\d+);x2=(-?\d+);y2=(-?\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g;
function parseSegmentation(text) {
  const out = [];
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(FRAME_RE)) {
    parts.push(text.slice(last, m.index ?? 0), m[1]);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  for (let i = 1; i < parts.length - 1; i += 2) {
    const frame = parseInt(parts[i], 10);
    const payload = parts[i + 1];
    for (const m of payload.matchAll(RECORD_RE)) {
      out.push({
        frame,
        object_id: parseInt(m[1], 10),
        box: { x1: +m[2], y1: +m[3], x2: +m[4], y2: +m[5], w: +m[6], h: +m[7] },
        confidence: m[8] ? parseFloat(m[8]) : null
      });
    }
  }
  return out;
}
__name(parseSegmentation, "parseSegmentation");
function mergeTracks(records, fps, offsetS = 0) {
  const byId = /* @__PURE__ */ new Map();
  for (const r of records) {
    const dets = byId.get(r.object_id) ?? [];
    dets.push({ frame: r.frame, t: Math.round((offsetS + r.frame / fps) * 100) / 100, box: r.box, confidence: r.confidence });
    byId.set(r.object_id, dets);
  }
  const tracks = [];
  for (const [object_id, dets] of byId) {
    tracks.push({
      object_id,
      n_frames: dets.length,
      first_seen: dets[0].t,
      last_seen: dets[dets.length - 1].t,
      confidence: Math.max(...dets.map((d) => d.confidence ?? 0)) || null,
      detections: dets
    });
  }
  tracks.sort((a, b) => a.first_seen - b.first_seen);
  return tracks;
}
__name(mergeTracks, "mergeTracks");

// worker/src/mock.ts
var FPS = 30;
function mockSamRecords(concept) {
  if (concept !== "dog" && concept !== "cat") concept = "dog";
  const records = [];
  for (let f = 0; f <= 12 * FPS; f += 2) {
    records.push(mk(f, 0, 300 + f * 0.4, 200 + f * 0.15, 0.93));
  }
  for (let f = 15 * FPS; f <= 30 * FPS; f += 2) {
    records.push(mk(f, 0, 320 + f * 0.35, 210 + f * 0.1, 0.9));
  }
  for (let f = 17 * FPS; f <= 21 * FPS; f += 3) {
    records.push(mk(f, 1, 640 - f * 0.5, 380, 0.81));
  }
  return records;
  function mk(frame, id, x, y, c) {
    return { frame, object_id: id, box: { x1: Math.round(x), y1: Math.round(y), x2: Math.round(x + 260), y2: Math.round(y + 200), w: 1280, h: 720 }, confidence: c };
  }
  __name(mk, "mk");
}
__name(mockSamRecords, "mockSamRecords");
function mockTracks() {
  return mergeTracks(mockSamRecords("dog"), FPS);
}
__name(mockTracks, "mockTracks");
function mockTranscript() {
  return "Biscuit has been missing since this evening. She is small, tan, with a white chest and a red collar. She loves the park behind the houses.";
}
__name(mockTranscript, "mockTranscript");
function mockMatch(trackKey) {
  const isTarget = trackKey.endsWith(":0");
  return {
    is_match: isTarget,
    confidence: isTarget ? 0.87 : 0.21,
    rationale: isTarget ? "Tan coat with a white chest patch and similar build to the reference photo; consistent with the description." : "Coat pattern and size differ from the reference photo; likely a different animal."
  };
}
__name(mockMatch, "mockMatch");
function mockPlan() {
  return {
    headline: `Search the park at dawn`,
    window: "Tomorrow 5:30\u20137:30 AM",
    area: "The park behind the houses and the alley toward Elm St",
    why: "Both sightings cluster in the evening near the park fence; lost dogs often return to familiar spots at dawn when streets are quiet.",
    steps: [
      "Walk the park fence line at first light with the reference photo",
      "Check the alley toward Elm St where track #1 was last seen",
      "Post the alert poster on the street\u2019s community group"
    ]
  };
}
__name(mockPlan, "mockPlan");
var MOCK_POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="960"><rect width="680" height="960" fill="#123"/><text x="340" y="120" font-size="64" fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="bold">MISSING DOG</text><text x="340" y="220" font-size="40" fill="#fda" text-anchor="middle" font-family="sans-serif">Biscuit</text><text x="340" y="540" font-size="26" fill="#cde" text-anchor="middle" font-family="sans-serif">Tan \xB7 white chest \xB7 red collar</text><text x="340" y="880" font-size="28" fill="#fff" text-anchor="middle" font-family="sans-serif">Seen on camera \u2014 help us bring her home</text></svg>`;

// worker/src/meta.ts
var BASE = "https://api.meta.ai/v1";
var BASETEN_BASE = "https://inference.baseten.co/v1";
function authHeaders(env) {
  return { Authorization: `Bearer ${env.META_API_KEY}`, "Content-Type": "application/json" };
}
__name(authHeaders, "authHeaders");
async function trackVideo(env, videoUrl, concept, fps) {
  const resp = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      model: "sam-3.1",
      input: [{
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: concept },
          { type: "input_video", video_url: videoUrl }
        ]
      }],
      stream: true
    })
  });
  if (!resp.ok || !resp.body) throw new Error(`SAM ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const text = await sseText(resp.body);
  return mergeTracks(parseSegmentation(text), fps);
}
__name(trackVideo, "trackVideo");
async function sseText(body) {
  let text = "";
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const evt of events) {
      for (const line of evt.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (j.type === "response.output_text.delta" && j.delta) text += j.delta;
        } catch {
        }
      }
    }
  }
  return text;
}
__name(sseText, "sseText");
async function sparkStructured(env, content, schemaName, schema) {
  const resp = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({
      model: env.SPARK_MODEL,
      input: [{ type: "message", role: "user", content }],
      text: { format: { type: "json_schema", name: schemaName, schema, strict: true } }
    })
  });
  if (!resp.ok) throw new Error(`responses ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const usage = j.usage ?? {};
  return { parsed: JSON.parse(j.output_text), usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 } };
}
__name(sparkStructured, "sparkStructured");
async function glimmerStructured(env, parts, schemaName, schema) {
  const resp = await fetch(`${BASETEN_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Api-Key ${env.BASETEN_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.GLIMMER_MODEL,
      messages: [{ role: "user", content: parts }],
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } }
    })
  });
  if (!resp.ok) throw new Error(`baseten ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const usage = j.usage ?? {};
  return { parsed: JSON.parse(j.choices[0].message.content), usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 } };
}
__name(glimmerStructured, "glimmerStructured");
async function toolLoop(env, input, tools, handlers) {
  let convo = input;
  let summary = "";
  const callsMade = [];
  for (let turn = 0; turn < 5; turn++) {
    const resp = await fetch(`${BASE}/responses`, {
      method: "POST",
      headers: authHeaders(env),
      body: JSON.stringify({ model: env.SPARK_MODEL, input: convo, tools })
    });
    if (!resp.ok) throw new Error(`responses ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const j = await resp.json();
    const out = j.output ?? [];
    const calls = out.filter((o) => o.type === "function_call");
    summary = out.filter((o) => o.type === "message").map((o) => (o.content ?? []).map((c) => c.text ?? "").join("")).join("") || summary;
    if (calls.length === 0) return { summary, calls: callsMade };
    convo = [...convo, ...out];
    for (const call of calls) {
      const args = JSON.parse(call.arguments || "{}");
      callsMade.push(call.name);
      let output = "ok";
      try {
        output = handlers[call.name] ? await handlers[call.name](args) : "unknown tool";
      } catch (e) {
        output = `tool failed: ${String(e).slice(0, 200)}`;
      }
      convo.push({ type: "function_call_output", call_id: call.call_id, output });
    }
  }
  return { summary, calls: callsMade };
}
__name(toolLoop, "toolLoop");
async function transcribe(env, wav) {
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({ mode: "DIARIZATION", model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" })], { type: "application/json" }), "request.json");
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "audio.wav");
  const resp = await fetch(`${BASE}/asr/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${env.META_API_KEY}` }, body: form });
  if (!resp.ok) throw new Error(`asr ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  return { transcript: (j.transcript ?? "").trim(), seconds: (j.audioDurationMs ?? 0) / 1e3 };
}
__name(transcribe, "transcribe");
async function generatePoster(env, prompt) {
  const resp = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: authHeaders(env),
    body: JSON.stringify({ model: "muse-image-1.0", prompt, size: "1024x1536" })
  });
  if (!resp.ok) throw new Error(`image ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image returned");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { png: bytes.buffer };
}
__name(generatePoster, "generatePoster");

// worker/src/index.ts
var app = new Hono3();
function mockMode(env) {
  return env.FMD_MOCK === "1" || !env.META_API_KEY;
}
__name(mockMode, "mockMode");
function newId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(newId, "newId");
function freshState(reportId) {
  return {
    report_id: reportId,
    created_at: Date.now(),
    pet: { name: "", species: "dog", description: "", photo_key: "" },
    transcript: null,
    transcript_error: null,
    clips: [],
    matches: [],
    next_search: null,
    summary: null,
    poster_key: null,
    matcher_model: null,
    cost: emptyCost()
  };
}
__name(freshState, "freshState");
app.post("/api/reports", async (c) => {
  const form = await c.req.formData();
  const state = freshState(newId());
  state.pet.name = String(form.get("pet_name") ?? "");
  state.pet.species = String(form.get("species") ?? "dog");
  state.pet.description = String(form.get("description") ?? "");
  const photo = form.get("photo");
  if (!photo) return c.json({ error: "photo required" }, 400);
  state.pet.photo_key = `${state.report_id}/pet_photo.jpg`;
  await c.env.MEDIA.put(state.pet.photo_key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type || "image/jpeg" } });
  const voice = form.get("voice_note");
  if (voice && voice.size > 0) {
    try {
      if (mockMode(c.env)) {
        state.transcript = mockTranscript();
      } else {
        const wav = await voice.arrayBuffer();
        const t = await transcribe(c.env, wav);
        state.transcript = t.transcript;
        addCost(state, { asr_seconds: t.seconds });
      }
    } catch (e) {
      state.transcript_error = String(e).slice(0, 300);
    }
  }
  await createState(c.env.DB, state);
  return c.json(publicState(state));
});
app.get("/api/reports/:id", async (c) => {
  const s = await readState(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "report not found" }, 404);
  return c.json(publicState(s));
});
function publicState(s) {
  return { ...s, pet: { ...s.pet, photo_url: `/api/reports/${s.report_id}/pet_photo` } };
}
__name(publicState, "publicState");
app.get("/api/reports/:id/pet_photo", async (c) => {
  const s = await readState(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  const obj = await c.env.MEDIA.get(s.pet.photo_key);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg" } });
});
app.put("/api/reports/:id/stills/:clipId/:objectId", async (c) => {
  const { id, clipId, objectId } = c.req.param();
  const s = await readState(c.env.DB, id);
  if (!s) return c.json({ error: "not found" }, 404);
  const key = `${id}/stills/${clipId}_${objectId}.jpg`;
  await c.env.MEDIA.put(key, await c.req.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
  return c.json({ key });
});
app.get("/api/reports/:id/stills/:clipId/:objectId", async (c) => {
  const { id, clipId, objectId } = c.req.param();
  const obj = await c.env.MEDIA.get(`${id}/stills/${clipId}_${objectId}.jpg`);
  if (!obj) return c.json({ error: "not found" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": "image/jpeg" } });
});
app.post("/api/reports/:id/clips", async (c) => {
  const s = await readState(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "report not found" }, 404);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file) return c.json({ error: "file required" }, 400);
  const clipId = newId();
  const key = `${s.report_id}/clips/${clipId}_${file.name.replace(/[^\w.-]/g, "_")}`;
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || "video/mp4" } });
  const fps = Number(form.get("fps")) || 30;
  const duration = Number(form.get("duration")) || 0;
  const origin = new URL(c.req.url).origin;
  const clip = {
    clip_id: clipId,
    filename: file.name,
    label: String(form.get("label") || file.name),
    captured_clock: String(form.get("captured_clock") || ""),
    fps,
    duration_s: duration,
    media_url: `${origin}/api/reports/${s.report_id}/clips/${clipId}`,
    status: "queued",
    error: null,
    tracks: [],
    n_tracks: 0,
    still_done: false
  };
  await updateState(c.env.DB, s.report_id, (st) => st.clips.push(clip));
  await c.env.PIPELINE.send({ reportId: s.report_id, clipId });
  return c.json(clip);
});
app.get("/api/reports/:id/clips/:clipId", async (c) => {
  const { id, clipId } = c.req.param();
  const s = await readState(c.env.DB, id);
  const clip = s?.clips.find((cl) => cl.clip_id === clipId);
  if (!s || !clip) return c.json({ error: "not found" }, 404);
  const key = clip.filename ? `${id}/clips/` : "";
  const list = await c.env.MEDIA.list({ prefix: `${id}/clips/${clipId}_` });
  const obj = list.objects[0] ? await c.env.MEDIA.get(list.objects[0].key) : null;
  if (!obj) return c.json({ error: "media missing" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "video/mp4",
      "Cache-Control": "public, max-age=3600",
      "X-Media-Key": key
    }
  });
});
app.delete("/api/reports/:id/clips/:clipId", async (c) => {
  const { id, clipId } = c.req.param();
  return c.json(await updateState(c.env.DB, id, (s) => {
    s.clips = s.clips.filter((cl) => cl.clip_id !== clipId);
    s.matches = s.matches.filter((m) => m.clip_id !== clipId);
  }));
});
app.patch("/api/reports/:id/clips/:clipId", async (c) => {
  const { id, clipId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  return c.json(await updateState(c.env.DB, id, (s) => {
    const cl = s.clips.find((x) => x.clip_id === clipId);
    if (!cl) throw new Error("clip not found");
    if (typeof body.label === "string") cl.label = body.label;
    if (typeof body.captured_clock === "string") cl.captured_clock = body.captured_clock;
    if (typeof body.fps === "number" && body.fps > 0) cl.fps = body.fps;
    if (typeof body.duration === "number" && body.duration > 0) cl.duration_s = body.duration;
    if (body.still_done === true) cl.still_done = true;
  }));
});
var MATCH_SCHEMA = {
  type: "object",
  properties: {
    is_match: { type: "boolean" },
    confidence: { type: "number" },
    rationale: { type: "string" }
  },
  required: ["is_match", "confidence", "rationale"]
};
function matchPrompt(pet, transcript, trackRef) {
  let desc = pet.description;
  if (transcript) desc += `
Owner's voice note: "${transcript}"`;
  return [
    {
      type: "input_text",
      text: `Lost pet report. Name: ${pet.name}. Species: ${pet.species}.
Description: ${desc}

Image 1 is the owner's reference photo of ${pet.name}. Image 2 is one detection (${trackRef}) cropped from neighborhood camera footage.
Decide whether the animal in image 2 could be ${pet.name}. Judge by robust appearance attributes (coat color/pattern, size, build, markings, ear/tail shape). If image 2 shows no animal or an unusable crop, is_match=false with low confidence.`
    }
  ];
}
__name(matchPrompt, "matchPrompt");
app.post("/api/reports/:id/match", async (c) => {
  const s0 = await readState(c.env.DB, c.req.param("id"));
  if (!s0) return c.json({ error: "report not found" }, 404);
  const candidates = [];
  for (const clip of s0.clips) {
    for (const t of clip.tracks) {
      const still = await c.env.MEDIA.head(`${s0.report_id}/stills/${clip.clip_id}_${t.object_id}.jpg`);
      if (t.n_frames > 0 && still) candidates.push({ clip, objectId: t.object_id });
    }
  }
  if (candidates.length === 0) return c.json({ error: "no tracked animals yet \u2014 ingest clips first" }, 400);
  if (mockMode(c.env)) {
    const verdicts2 = candidates.map(({ clip, objectId }) => {
      const v = mockMatch(`${clip.clip_id}:${objectId}`);
      return { clip_id: clip.clip_id, object_id: objectId, is_match: v.is_match, score: v.confidence, rationale: v.rationale, confirmed: null };
    });
    const st2 = await updateState(c.env.DB, s0.report_id, (s) => {
      s.matches = verdicts2;
      s.matcher_model = "mock";
    });
    return c.json(publicState(st2));
  }
  const verdicts = [];
  let modelUsed = "";
  const usage = { input: 0, output: 0 };
  const petPhotoB64 = await b64Of(c.env, s0.pet.photo_key);
  if (c.env.BASETEN_API_KEY) {
    try {
      for (const { clip, objectId } of candidates) {
        const stillB64 = await b64Of(c.env, `${s0.report_id}/stills/${clip.clip_id}_${objectId}.jpg`);
        const r = await glimmerStructured(
          c.env,
          [
            { type: "text", text: matchPrompt(s0.pet, s0.transcript, `${clip.clip_id}:${objectId}`)[0].text },
            { type: "image_url", image_url: { url: petPhotoB64 } },
            { type: "image_url", image_url: { url: stillB64 } }
          ],
          "match_verdict",
          MATCH_SCHEMA
        );
        usage.input += r.usage.input;
        usage.output += r.usage.output;
        verdicts.push(toVerdict(clip.clip_id, objectId, r.parsed));
        modelUsed = `glimmer:${c.env.GLIMMER_MODEL}`;
      }
    } catch {
      verdicts.length = 0;
    }
  }
  if (verdicts.length === 0) {
    for (const { clip, objectId } of candidates) {
      const stillB64 = await b64Of(c.env, `${s0.report_id}/stills/${clip.clip_id}_${objectId}.jpg`);
      const content = matchPrompt(s0.pet, s0.transcript, `${clip.clip_id}:${objectId}`);
      content.push({ type: "input_image", image_url: petPhotoB64 });
      content.push({ type: "input_image", image_url: stillB64 });
      const r = await sparkStructured(c.env, content, "match_verdict", MATCH_SCHEMA);
      usage.input += r.usage.input;
      usage.output += r.usage.output;
      verdicts.push(toVerdict(clip.clip_id, objectId, r.parsed));
      modelUsed = `spark:${c.env.SPARK_MODEL}`;
    }
  }
  const st = await updateState(c.env.DB, s0.report_id, (s) => {
    s.matches = verdicts;
    s.matcher_model = modelUsed;
    addCost(s, { spark_in: usage.input, spark_out: usage.output });
  });
  return c.json(publicState(st));
});
function toVerdict(clipId, objectId, parsed) {
  return {
    clip_id: clipId,
    object_id: objectId,
    is_match: !!parsed.is_match,
    score: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    rationale: String(parsed.rationale ?? "").slice(0, 300),
    confirmed: null
  };
}
__name(toVerdict, "toVerdict");
async function b64Of(env, key) {
  const obj = await env.MEDIA.get(key);
  if (!obj) throw new Error(`missing object ${key}`);
  const buf = await obj.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return "data:image/jpeg;base64," + btoa(bin);
}
__name(b64Of, "b64Of");
app.post("/api/reports/:id/matches/confirm", async (c) => {
  const { id } = c.req.param();
  const { clip_id, object_id, confirmed } = await c.req.json();
  return c.json(await updateState(c.env.DB, id, (s) => {
    const m = s.matches.find((mm) => mm.clip_id === clip_id && mm.object_id === object_id);
    if (m) m.confirmed = !!confirmed;
  }));
});
function sightingsOf(s) {
  const out = [];
  for (const m of s.matches) {
    if (m.confirmed !== true) continue;
    const clip = s.clips.find((cl) => cl.clip_id === m.clip_id);
    const track = clip?.tracks.find((t) => t.object_id === m.object_id);
    if (!clip || !track) continue;
    out.push({
      clip_id: clip.clip_id,
      object_id: m.object_id,
      place: clip.label,
      clock: clip.captured_clock,
      t_in_clip: track.first_seen,
      duration_seen: Math.round((track.last_seen - track.first_seen) * 10) / 10,
      confidence: m.score,
      still: `/api/reports/${s.report_id}/stills/${m.clip_id}/${m.object_id}`,
      media_url: clip.media_url
    });
  }
  out.sort((a, b) => a.clock < b.clock ? -1 : 1);
  return out;
}
__name(sightingsOf, "sightingsOf");
app.get("/api/reports/:id/timeline", async (c) => {
  const s = await readState(c.env.DB, c.req.param("id"));
  if (!s) return c.json({ error: "not found" }, 404);
  return c.json({ sightings: sightingsOf(s), next_search: s.next_search, poster: s.poster_key ? `/api/reports/${s.report_id}/poster` : null, cost: s.cost, summary: s.summary });
});
var TOOLS = [
  {
    type: "function",
    name: "suggest_next_search",
    description: "Record the recommended next search plan for the owner, based on the sighting pattern.",
    parameters: {
      type: "object",
      properties: {
        headline: { type: "string" },
        window: { type: "string" },
        area: { type: "string" },
        why: { type: "string" },
        steps: { type: "array", items: { type: "string" } }
      },
      required: ["headline", "window", "area", "why", "steps"]
    }
  },
  {
    type: "function",
    name: "make_poster",
    description: "Generate a shareable lost-pet alert poster image.",
    parameters: {
      type: "object",
      properties: { poster_prompt: { type: "string" }, headline_text: { type: "string" } },
      required: ["poster_prompt", "headline_text"]
    }
  }
];
app.post("/api/reports/:id/analyze", async (c) => {
  const s0 = await readState(c.env.DB, c.req.param("id"));
  if (!s0) return c.json({ error: "not found" }, 404);
  const sightings = sightingsOf(s0);
  if (sightings.length === 0) return c.json({ error: "no confirmed sightings yet" }, 400);
  if (mockMode(c.env)) {
    const plan2 = mockPlan();
    const key = `${s0.report_id}/poster.png`;
    await c.env.MEDIA.put(key, MOCK_POSTER_SVG, { httpMetadata: { contentType: "image/svg+xml" } });
    const st2 = await updateState(c.env.DB, s0.report_id, (s) => {
      s.next_search = plan2;
      s.poster_key = key;
      s.summary = `Sighted ${sightings.length} time(s) on neighborhood cameras. Plan recorded and poster ready.`;
    });
    return c.json({ next_search: st2.next_search, poster: `/api/reports/${st2.report_id}/poster`, summary: st2.summary, sightings });
  }
  const best = sightings.reduce((a, b) => a.confidence >= b.confidence ? a : b);
  const bestB64 = await b64Of(c.env, `${s0.report_id}/stills/${best.clip_id}_${best.object_id}`);
  const input = [{
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: `You are the search coordinator for a lost ${s0.pet.species} named ${s0.pet.name}.
Owner description: ${s0.pet.description}
Owner voice note: ${s0.transcript ?? "n/a"}
Confirmed camera sightings:
${JSON.stringify(sightings, null, 1)}

Decide what to do next using your tools: record a concrete next-search plan (suggest_next_search) and generate the shareable alert poster (make_poster). Then finish with a one-paragraph summary for the owner.`
      },
      { type: "input_image", image_url: bestB64 }
    ]
  }];
  let plan = null;
  let posterKey = null;
  let images = 0;
  const { summary, calls } = await toolLoop(c.env, input, TOOLS, {
    suggest_next_search: /* @__PURE__ */ __name(async (args) => {
      plan = args;
      return "plan recorded";
    }, "suggest_next_search"),
    make_poster: /* @__PURE__ */ __name(async (args) => {
      const r = await generatePoster(
        c.env,
        `${args.poster_prompt}. Bold headline text at top: '${args.headline_text}'. Clean lost-pet alert poster layout, high contrast, printable.`
      );
      posterKey = `${s0.report_id}/poster.png`;
      await c.env.MEDIA.put(posterKey, r.png, { httpMetadata: { contentType: "image/png" } });
      images++;
      return "poster generated";
    }, "make_poster")
  });
  const st = await updateState(c.env.DB, s0.report_id, (s) => {
    if (plan) s.next_search = plan;
    if (posterKey) s.poster_key = posterKey;
    if (summary) s.summary = summary;
    addCost(s, { images });
  });
  return c.json({
    next_search: st.next_search,
    poster: st.poster_key ? `/api/reports/${st.report_id}/poster` : null,
    summary: st.summary,
    calls,
    sightings
  });
});
app.get("/api/reports/:id/poster", async (c) => {
  const s = await readState(c.env.DB, c.req.param("id"));
  const key = s?.poster_key;
  if (!s || !key) return c.json({ error: "no poster yet" }, 404);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.json({ error: "no poster yet" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/png" } });
});
app.get(
  "/api/health",
  (c) => c.json({ ok: true, mock: mockMode(c.env), matcher: c.env.BASETEN_API_KEY ? "glimmer-available" : "spark" })
);
var src_default = {
  fetch: app.fetch,
  async queue(batch, env, _ctx) {
    for (const msg of batch.messages) {
      const { reportId, clipId } = msg.body;
      const setClip = /* @__PURE__ */ __name((fn) => updateState(env.DB, reportId, (s) => {
        const cl = s.clips.find((x) => x.clip_id === clipId);
        if (cl) fn(cl);
      }), "setClip");
      try {
        const s = await readState(env.DB, reportId);
        const clip = s?.clips.find((x) => x.clip_id === clipId);
        if (!s || !clip) {
          msg.ack();
          continue;
        }
        const concept = s.pet.species === "cat" ? "cat" : "dog";
        if (mockMode(env)) {
          await setClip((cl) => {
            cl.status = "tracking";
          });
          const tracks = mockTracks();
          const placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="200"><rect width="260" height="200" fill="#234"/><text x="130" y="105" font-size="20" fill="#cde" text-anchor="middle" font-family="sans-serif">mock track</text></svg>';
          for (const t of tracks) {
            await env.MEDIA.put(`${reportId}/stills/${clipId}_${t.object_id}.jpg`, placeholder, { httpMetadata: { contentType: "image/svg+xml" } });
          }
          await setClip((cl) => {
            cl.tracks = tracks;
            cl.n_tracks = tracks.length;
            cl.status = "done";
            cl.still_done = true;
          });
        } else {
          await setClip((cl) => {
            cl.status = "tracking";
          });
          const tracks = await trackVideo(env, clip.media_url, concept, clip.fps);
          const framesBilled = Math.round(clip.fps * clip.duration_s);
          await setClip((cl) => {
            cl.tracks = tracks;
            cl.n_tracks = tracks.length;
            cl.status = "done";
          });
          await updateState(env.DB, reportId, (st) => addCost(st, { sam_frames: framesBilled }));
        }
        msg.ack();
      } catch (e) {
        await setClip((cl) => {
          cl.status = "error";
          cl.error = String(e).slice(0, 400);
        }).catch(() => {
        });
        msg.retry();
      }
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Zo7dtn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Zo7dtn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
