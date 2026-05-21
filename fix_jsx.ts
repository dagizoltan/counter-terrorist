import { jsx } from "https://deno.land/x/hono@v4.3.7/jsx/index.ts";
import { renderToReadableStream } from "https://deno.land/x/hono@v4.3.7/jsx/streaming.ts";

const node = jsx("div", {}, "hello");
console.log(node);
