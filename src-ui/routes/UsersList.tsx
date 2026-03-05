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

function UsersList() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [offset, setOffset] = React.useState(0);
  const [perPage, setPerPage] = React.useState(20);

  const [totalCount, setTotalCount] = React.useState(-1);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams({
          offset: String(offset),
          per_page: String(perPage),
        });
        const res = await fetch(`/classbot/api/users?${params}`);
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status} ${res.statusText}`);
        }
        const body: PaginatedResponse<User> = await res.json();
        setUsers(body.data);
        const rels = parseLinkRels(res.headers.get("Link"));
        if (body.total_count) {
          setTotalCount(body.total_count);
        } else {
          setTotalCount(rels.has("next") ? -1 : body.offset + body.data.length);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [offset, perPage]);

  const handlePageChange = (_: unknown, newPage: number) => {
    setOffset(newPage * perPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPerPage(parseInt(e.target.value));
    setOffset(0);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Users
      </Typography>
      {loading && <CircularProgress />}
      {error && <Typography color="error">{error}</Typography>}
      {!loading && !error && (
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
      )}
    </Box>
  );
}

export default UsersList;
