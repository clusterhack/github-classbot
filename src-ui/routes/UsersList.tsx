import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import { createRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { Route as rootRoute } from "./Root";
import { User, PaginatedResponse } from "../models";

function parseLinkRels(header: string | null): Set<string> {
  const rels = new Set<string>();
  if (!header) return rels;
  for (const part of header.split(",")) {
    const match = part.trim().match(/rel=(?:"([^"]+)|([A-Za-z]+))"/);
    if (match) rels.add((match[1] || match[2]).toLowerCase());
  }
  return rels;
}

function usersQueryOptions(offset: number, perPage: number) {
  return queryOptions({
    queryKey: ["users", { offset, perPage }],
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        per_page: String(perPage),
      });
      const res = await fetch(`/classbot/api/users?${params}`);
      if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      }
      const body: PaginatedResponse<User> = await res.json();
      const rels = parseLinkRels(res.headers.get("Link"));
      const totalCount = body.total_count
        ? body.total_count
        : rels.has("next")
          ? -1
          : body.offset + body.data.length;
      return { users: body.data, totalCount };
    },
  });
}

function UsersList() {
  const { offset, per_page: perPage } = Route.useSearch();
  const {
    data: { users, totalCount },
  } = useSuspenseQuery(usersQueryOptions(offset, perPage));
  const navigate = Route.useNavigate();

  const handlePageChange = (_: unknown, newPage: number) => {
    navigate({ search: { offset: newPage * perPage, per_page: perPage } });
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    navigate({ search: { offset: 0, per_page: parseInt(e.target.value) } });
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Users
      </Typography>
      <Paper>
        <TableContainer sx={{ maxHeight: "calc(100vh - 220px)" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>SIS ID</TableCell>
                <TableCell>Role</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id} hover>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{user.name ?? "—"}</TableCell>
                  <TableCell>{user.sisId ?? "—"}</TableCell>
                  <TableCell>{user.role ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={offset / perPage}
          rowsPerPage={perPage}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
        />
      </Paper>
    </Box>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/users",
  validateSearch: search => ({
    offset: Number(search.offset ?? 0),
    per_page: Number(search.per_page ?? 20),
  }),
  loaderDeps: ({ search: { offset, per_page } }) => ({ offset, per_page }),
  loader: ({ context: { queryClient }, deps: { offset, per_page } }) =>
    queryClient.ensureQueryData(usersQueryOptions(offset, per_page)),
  pendingComponent: () => <CircularProgress />,
  errorComponent: ({ error }) => <Typography color="error">{(error as Error).message}</Typography>,
  component: UsersList,
});

export default UsersList;
