import React from "react";
import {
  Link as RouterLink,
  LinkProps as RouterLinkProps,
  Outlet as RouterOutlet,
} from "react-router-dom";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { LinkProps } from "@mui/material/Link";

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

function Root() {
  return (
    <ThemeProvider theme={theme}>
      <Stack sx={{ spacing: 0, width: "100vw" }}>
        <Box>
          <AppBar position="static">
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
              <Button href="/" sx={{ color: "#fff" }}>
                HOME
              </Button>
              <Button href="/profile">
                <Avatar>SP</Avatar>
              </Button>
            </Toolbar>
          </AppBar>
        </Box>
        <Box sx={{ flexGrow: 1, m: 2 }}>
          <RouterOutlet />
        </Box>
      </Stack>
    </ThemeProvider>
  );
}

export default Root;
