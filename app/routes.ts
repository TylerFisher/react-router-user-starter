import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  ...prefix("/accounts", [
    route("change-email", "routes/accounts/change-email.tsx"),
    route("forgot-password", "routes/accounts/forgot-password.tsx"),
    route("login", "routes/accounts/login.tsx"),
    route("logout", "routes/accounts/logout.ts"),
    route("onboarding", "routes/accounts/onboarding.tsx"),
    route("password", "routes/accounts/password.tsx"),
    route("reset-password", "routes/accounts/reset-password.tsx"),
    route("signup", "routes/accounts/signup.tsx"),
    route("user/delete", "routes/accounts/user.delete.ts"),
    route("verify", "routes/accounts/verify.tsx"),
  ])
] satisfies RouteConfig;
