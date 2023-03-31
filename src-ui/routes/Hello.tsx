import React, { useState } from "react";
import { blueGrey } from "@mui/material/colors";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import classbotLogo from "../assets/classbot.png";

function Hello() {
  const [count, setCount] = useState(0);

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <a href="https://github.com/clusterhack/github-classbot" target="_blank" rel="noreferrer">
            <Avatar
              alt="ClassBot"
              src={classbotLogo}
              sx={{ width: 225, height: 225, bgcolor: blueGrey[50] }}
            />
          </a>
          <Typography variant="h4" component="h1" gutterBottom>
            ClassBot
          </Typography>
          <Button variant="contained" size="large" onClick={() => setCount(count => count + 1)}>
            Count is {count}
          </Button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </Stack>
      </Box>
    </Container>
  );
}

export default Hello;
