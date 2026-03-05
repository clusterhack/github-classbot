import React from "react";
import ReactDOM from "react-dom/client";
import { createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CssBaseline from "@mui/material/CssBaseline";

import { Route as rootRoute } from "./routes/Root";
import Hello from "./routes/Hello";
import Profile from "./routes/Profile";
import { Route as adminUsersRoute } from "./routes/UsersList";

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

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL, // .replace(/\/$/, ""),
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <CssBaseline />
      <RouterProvider router={router} context={{ queryClient }} />
    </QueryClientProvider>
  </React.StrictMode>
);
