import { Context } from "hono";

export const handlerFactory = () => {
  return async (c: Context) => {
    return c.json({ success: true, message: "Shadow Mode Engaged" });
  };
};
