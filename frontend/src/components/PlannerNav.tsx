import * as React from "react";
import { Box, Button, Stack, Divider } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ListAltIcon from "@mui/icons-material/ListAlt";
import { Link as RouterLink } from "react-router-dom";

export default function PlannerNav() {
  const toDashboard = React.useCallback(() => {}, []);
  const toTrips = React.useCallback(() => {}, []);

  return (
    <Box sx={{ mb: 2 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            display: "flex",
            justifyContent: "space-around",
            width: "100%",
          }}
        >
          <Button
            component={RouterLink}
            to="/dashboard"
            onClick={toDashboard}
            startIcon={<DashboardIcon />}
            variant="outlined"
            size="small"
            sx={{
              minWidth: 150,
            }}
          >
            Dashboard
          </Button>
          <Button
            component={RouterLink}
            to="/trips"
            onClick={toTrips}
            startIcon={<ListAltIcon />}
            variant="outlined"
            size="small"
            sx={{
              minWidth: 150,
            }}
          >
            Trips
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ mt: 2 }} />
    </Box>
  );
}
