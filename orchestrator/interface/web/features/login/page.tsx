/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";

export const Login = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login | Security Orchestrator</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="/components/theme.css" />
        <link rel="stylesheet" href="/pages/login/style.css" />
      </head>
      <body class="login-container">
        <div class="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md login-box">
          <div class="flex items-center gap-2 mb-6 justify-center">
            <div class="w-4 h-4 rounded-full bg-red-500 animate-pulse"></div>
            <h1 class="font-bold text-2xl tracking-tight text-center">SECURE_ROOT</h1>
          </div>
          <form method="POST" action="/login" class="space-y-4">
            <div>
              <label class="block text-slate-400 text-sm font-bold mb-2" for="password">
                Authentication Token
              </label>
              <input
                class="bg-slate-900 border border-slate-700 text-white rounded w-full py-2 px-3 leading-tight focus:outline-none focus:border-red-500"
                id="password"
                name="password"
                type="password"
                placeholder="Enter Token"
                required
              />
            </div>
            <button
              class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none transition-colors"
              type="submit"
            >
              LOGIN
            </button>
          </form>
          <div class="mt-4 text-center text-xs text-slate-500">
            Unauthorized access is strictly prohibited and logged.
          </div>
        </div>
      </body>
    </html>
  );
};
