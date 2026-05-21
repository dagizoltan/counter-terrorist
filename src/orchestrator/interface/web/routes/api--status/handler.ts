import { Context } from "hono";
import { bootstrap } from "../../../../app/bootstrapper.ts";

export const handlerFactory = () => {
  return async (c: Context) => {
    return c.json(await bootstrap());
  };
};
