import React from "react";
import ReactDOM from "react-dom/client";
import { createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import CssBaseline from "@mui/material/CssBaseline";

import { Route as rootRoute } from "./routes/Root";
import Hello from "./routes/Hello";
import Profile from "./routes/Profile";
import UsersList from "./routes/UsersList";

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Hello,
});
const submissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/self/submissions",
  component: Profile, // TODO
});
const alertsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/self/alerts",
  component: Profile, // TODO
});
const adminUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users",
  component: UsersList,
});
const adminSubmissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/submissions",
  component: Profile, // TODO
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  submissionsRoute,
  alertsRoute,
  adminUsersRoute,
  adminSubmissionsRoute,
]);

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL, // .replace(/\/$/, ""),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CssBaseline />
    <RouterProvider router={router} />
  </React.StrictMode>
);
