import React from "react";
import {
  useLoaderData,
  Link as RouterLink,
  LinkProps as RouterLinkProps,
  Outlet as RouterOutlet,
} from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Drawer from "@mui/material/Drawer";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import { LinkProps } from "@mui/material/Link";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListItemButton from "@mui/material/ListItemButton";
import Popover from "@mui/material/Popover";

import MenuIcon from "@mui/icons-material/Menu";
import ScoreboardIcon from "@mui/icons-material/Scoreboard";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SchoolIcon from "@mui/icons-material/School";
import HomeIcon from "@mui/icons-material/Home";
import SecurityIcon from "@mui/icons-material/Security";

import classbotLogo from "../assets/classbot.png";

// Note: Based mostly on MUI docs examples (primarily for Drawer, Popover, and router usage),
//   with some tweaks based on https://codesandbox.io/s/material-ui-responsive-drawer-skqdw
// TODO? When/if time, check performance of useMediaQuery (tweak above) vs duplicating Drawer component (as in MUI doc examples)

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

function Root(drawerWidth = 220) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user } = useLoaderData() as any; // TODO db model interfaces...

  //const theme = useTheme();
  const isMediaSmall = useMediaQuery(theme.breakpoints.down("sm"));

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const userButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const [userCardOpen, setUserCardOpen] = React.useState(false);

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleUserCardToggle = () => {
    setUserCardOpen(!userCardOpen);
  };

  // TODO? Shorten user.name to 1-2 letters (for main Avatar cdata child)
  const userAvatar =
    user.role === "admin" ? (
      <Badge
        overlap="circular"
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        badgeContent={
          <Avatar
            alt="Administrator"
            sx={{
              width: 22,
              height: 22,
              bgcolor: "warning.main",
              border: 1,
              borderColor: "background.paper",
            }}
          >
            <SecurityIcon sx={{ fontSize: 16 }} />
          </Avatar>
        }
      >
        <Avatar src={`https://avatars.githubusercontent.com/u/${user.id}`}>${user.name}</Avatar>
      </Badge>
    ) : (
      <Avatar src={`https://avatars.githubusercontent.com/u/${user.id}`}>${user.name}</Avatar>
    );

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: "flex" }}>
        <AppBar position="fixed" sx={{ zIndex: theme => theme.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton
              size="large"
              edge="start"
              color="inherit"
              aria-label="navigation menu"
              onClick={handleDrawerToggle}
              sx={{ mr: 1, display: { sm: "none" } }}
            >
              <MenuIcon />
            </IconButton>
            <Avatar
              src={classbotLogo}
              sx={{ p: 0.5, mr: 2, bgcolor: "grey.200", display: { xs: "none", sm: "inherit" } }}
            ></Avatar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              ClassBot
            </Typography>
            <Button ref={userButtonRef} aria-describedby="user-card" onClick={handleUserCardToggle}>
              {userAvatar}
              {/* TODO? Badge for admins */}
            </Button>
            <Popover
              id="user-card"
              aria-label="user information"
              open={userCardOpen}
              onClose={handleUserCardToggle}
              anchorEl={userButtonRef.current}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              PaperProps={{ sx: { p: 1, pl: 2, pr: 2 } }}
            >
              <Typography color="inherit" variant="h6" gutterBottom>
                {user?.name}
              </Typography>
              <Typography color="text.secondary">
                {user?.username} / {user?.sisId}
              </Typography>
            </Popover>
          </Toolbar>
        </AppBar>
        <Drawer
          variant={isMediaSmall ? "temporary" : "permanent"}
          anchor="left"
          open={drawerOpen}
          onClose={handleDrawerToggle}
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
              <Typography variant="overline" sx={{ pl: 2, mt: 0.5 }}>
                Admin
              </Typography>
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
