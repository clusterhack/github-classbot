import React from "react";
import {
  useLoaderData,
  Link as RouterLink,
  LinkProps as RouterLinkProps,
  Outlet as RouterOutlet,
} from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Drawer from "@mui/material/Drawer";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { LinkProps } from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";

import ScoreboardIcon from "@mui/icons-material/Scoreboard";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SchoolIcon from "@mui/icons-material/School";
import HomeIcon from "@mui/icons-material/Home";

const drawerWidth = 220; // TODO? Make <Root> param ?

const LinkBehavior = React.forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, "to"> & { href: RouterLinkProps["to"] }
>((props, ref) => {
  const { href, ...other } = props;
  // Map href (MUI) -> to (react-router)
  return <RouterLink data-testid="custom-link" ref={ref} to={href} {...other} />;
});
LinkBehavior.displayName = "LinkBehavior";

const theme = createTheme({
  components: {
    MuiLink: {
      defaultProps: {
        component: LinkBehavior,
      } as LinkProps,
    },
    MuiButtonBase: {
      defaultProps: {
        LinkComponent: LinkBehavior,
      },
    },
  },
});

export async function loader() {
  const res = await fetch("/classbot/api/self/profile");
  return { user: await res.json() };
}

function Root() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user } = useLoaderData() as any; // TODO db model interfaces...
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: "flex" }}>
        <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
          <Toolbar>
            {/* <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="menu"
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton> */}
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              ClassBot
            </Typography>
            <Tooltip
              title={
                <React.Fragment>
                  <Typography color="inherit" variant="subtitle1">User Profile</Typography>
                  {user?.name}<br />{user?.username} / {user?.sisId}
                </React.Fragment>
              }
            >
              <Button>
                <Avatar src={`https://avatars.githubusercontent.com/u/${user.id}`}>SP</Avatar>
              </Button>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            ["& .MuiDrawer-paper"]: { width: drawerWidth, boxSizing: "border-box" },
          }}
        >
          <Toolbar />
          <List>
            <ListItem key="Home" disablePadding>
              <ListItemButton href="/">
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary="Home" />
              </ListItemButton>
            </ListItem>
            <ListItem key="Submissions" disablePadding>
              <ListItemButton href="/self/submissions">
                <ListItemIcon>
                  <ScoreboardIcon />
                </ListItemIcon>
                <ListItemText primary="Submissions" />
              </ListItemButton>
            </ListItem>
            <ListItem key="Alerts" disablePadding>
              <ListItemButton href="/self/alerts">
                <ListItemIcon>
                  <NotificationsIcon />
                </ListItemIcon>
                <ListItemText primary="Alerts" />
              </ListItemButton>
            </ListItem>
          </List>
          {user?.role === "admin" && (
            <>
              <Divider />
              <Typography variant="overline" sx={{ pl: 2 }}>Admin</Typography>
              <List>
                <ListItem key="AdminSubmissions" disablePadding>
                  <ListItemButton href="/admin/submissions">
                    <ListItemIcon>
                      <SchoolIcon />
                    </ListItemIcon>
                    <ListItemText primary="All submissions" />
                  </ListItemButton>
                </ListItem>
              </List>
            </>
          )}
        </Drawer>
        <Box sx={{ flexGrow: 1, p: 2 }}>
          <Toolbar />
          <RouterOutlet />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default Root;
