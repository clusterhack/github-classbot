import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import Root, { loader as rootLoader } from "./routes/Root";
import Hello from "./routes/Hello";
import Profile from "./routes/Profile";
import CssBaseline from "@mui/material/CssBaseline";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Root />,
      loader: rootLoader,
      children: [
        {
          path: "",
          element: <Hello />,
        },
        {
          path: "/self/submissions",
          element: <Profile />, // TODO!
        },
        {
          path: "/self/alerts",
          element: <Profile />, // TODO!
        },
        {
          path: "/admin/submissions",
          element: <Profile />, // TODO!
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  }
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <CssBaseline />
    <RouterProvider router={router} />
  </React.StrictMode>
);
