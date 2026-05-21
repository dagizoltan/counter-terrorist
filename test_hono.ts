import { jsx } from "https://deno.land/x/hono@v4.3.7/jsx/index.ts";
import { renderToString } from "https://deno.land/x/hono@v4.3.7/jsx/index.ts";

const node = jsx("div", {}, "hello");
console.log(typeof node);
console.log(renderToString(node));
