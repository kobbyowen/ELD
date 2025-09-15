import { useMemo, useState, useCallback, memo, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Tab,
  Tabs,
  Typography,
  Card,
  CardContent,
  CardHeader,
  CardActions,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { alpha } from "@mui/material/styles";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AddIcon from "@mui/icons-material/Add";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BarChartIcon from "@mui/icons-material/BarChart";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DescriptionIcon from "@mui/icons-material/Description";
import { Link as RouterLink } from "react-router-dom";

import type { Trip, DailyLog, Driver } from "../lib/types";
import { ELDLogEngine } from "../lib/eld-engine";
import { UserAvatarMenu } from "../components/UserAvatarMenu";
import { apiFetch } from "../lib/api";

type TabValue = "trips" | "logs" | "compliance";
type Props = { driver?: Driver };

type DashboardStats = {
  totalTrips: number;
  activeTrips: number;
  completedTrips: number;
  currentCycleHours: number;
  complianceRate: number;
  violationsThisWeek: number;
};

type AnalyticsResponse = {
  stats: DashboardStats;
  recentTrips: Trip[];
  recentLogs: DailyLog[];
  driver?: Partial<Driver>;
};

export default function Dashboard({ driver }: Props) {
  const fallbackDriver: Driver = useMemo(
    () =>
      driver ?? {
        id: "drv-1",
        first_name: "Driver",
        carrier_name: "Carrier Inc.",
        license_number: "ABC123456",
      },
    [driver]
  );

  const [tab, setTab] = useState<TabValue>("trips");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [recentLogs, setRecentLogs] = useState<DailyLog[]>([]);
  const [resolvedDriver, setResolvedDriver] = useState<Driver>(fallbackDriver);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await apiFetch("/api/dashboard/analytics");
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || "Failed to load analytics");
        }
        const data: AnalyticsResponse = await res.json();

        if (!mounted) return;
        setStats(data.stats);
        setTrips(data.recentTrips ?? []);
        setRecentLogs(data.recentLogs ?? []);

        // prefer API-provided driver fields when available
        setResolvedDriver(
          (prev) =>
            ({
              ...prev,
              ...(data.driver ?? {}),
            } as Driver)
        );
      } catch (e: any) {
        if (mounted) setError(e?.message || "Failed to load analytics");
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fallbackDriver.id]);

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, v: TabValue) => setTab(v),
    []
  );

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 6, px: { xs: 2, sm: 3 } }}>
        <Stack alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 6, px: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Header driver={resolvedDriver} />
          <Alert severity="error">{error}</Alert>
        </Stack>
      </Container>
    );
  }

  // Safe fallbacks if API omitted something
  const safeStats: DashboardStats = stats ?? {
    totalTrips: trips.length,
    activeTrips: trips.filter((t) => t.status === "in_progress").length,
    completedTrips: trips.filter((t) => t.status === "completed").length,
    currentCycleHours: 0,
    complianceRate: 100,
    violationsThisWeek: 0,
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6, px: { xs: 2, sm: 3 } }}>
      <Header driver={resolvedDriver} />

      <StatsGrid stats={safeStats} />

      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
        }}
      >
        <Tabs
          value={tab}
          onChange={handleTabChange}
          aria-label="dashboard tabs"
          variant="scrollable"
          scrollButtons="auto"
          TabIndicatorProps={{ style: { display: "none" } }}
          sx={{
            mb: 2,
            "& .MuiTab-root": {
              textTransform: "none",
              borderRadius: 999,
              minHeight: 36,
              px: 2.5,
              mx: 0.5,
            },
            "& .MuiTab-root.Mui-selected": {
              bgcolor: (t) => t.palette.primary.main,
              color: (t) => t.palette.primary.contrastText,
            },
            "& .MuiTabs-flexContainer": { alignItems: "center" },
          }}
        >
          <Tab label="Recent Trips" value="trips" />
          <Tab label="Daily Logs" value="logs" />
          <Tab label="Compliance" value="compliance" />
        </Tabs>

        {tab === "trips" && <TripsTab trips={trips} />}
        {tab === "logs" && <LogsTab logs={recentLogs} />}
        {tab === "compliance" && <ComplianceTab stats={safeStats} />}
      </Box>
    </Container>
  );
}

/* ---------- Small helpers (identical logic) ---------- */

function statusColor(status: Trip["status"]) {
  switch (status) {
    case "planned":
      return "default";
    case "in_progress":
      return "secondary";
    case "completed":
      return "primary";
    case "cancelled":
      return "error";
    default:
      return "default";
  }
}

function cycleStatusColor(hours: number) {
  if (hours >= 60) return "error.main";
  if (hours >= 50) return "secondary.main";
  return "primary.main";
}

function complianceColor(rate: number) {
  if (rate >= 95) return "primary.main";
  if (rate >= 85) return "secondary.main";
  return "error.main";
}

const Header = memo(function Header({ driver }: { driver: Driver }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      mb={3}
    >
      <Box>
        <Typography variant="h4" fontWeight={700}>
          Welcome back, {driver.first_name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {driver.carrier_name ? `${driver.carrier_name} • ` : ""}
          License: {driver.license_number}
        </Typography>
      </Box>
      <Button
        component={RouterLink}
        to="/trips/new"
        startIcon={<AddIcon />}
        variant="contained"
      >
        New Trip
      </Button>

      <UserAvatarMenu
        firstName={driver.first_name}
        lastName={(driver as any)?.last_name || ""}
        email={(driver as any)?.email}
      />
    </Stack>
  );
});

/* ---------- Stats Grid ---------- */

const StatsGrid = memo(function StatsGrid({
  stats,
}: {
  stats: {
    totalTrips: number;
    activeTrips: number;
    completedTrips: number;
    currentCycleHours: number;
    complianceRate: number;
    violationsThisWeek: number;
  };
}) {
  return (
    <Grid container spacing={2} mb={3} alignItems="stretch">
      <Grid
        size={{ xs: 12, md: 6, lg: 3 }}
        sx={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Card elevation={1}>
          <CardHeader
            title={<Typography variant="subtitle2">Total Trips</Typography>}
            action={<LocalShippingIcon color="disabled" fontSize="small" />}
            sx={{ pb: 0 }}
          />
          <CardContent>
            <Typography variant="h5" fontWeight={700}>
              {stats.totalTrips}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stats.activeTrips} active, {stats.completedTrips} completed
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid
        size={{ xs: 12, md: 6, lg: 3 }}
        sx={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Card elevation={1} sx={{ height: "100%" }}>
          <CardHeader
            title={<Typography variant="subtitle2">Cycle Hours</Typography>}
            action={<AccessTimeIcon color="disabled" fontSize="small" />}
            sx={{ pb: 0 }}
          />
          <CardContent>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ color: cycleStatusColor(stats.currentCycleHours) }}
            >
              {stats.currentCycleHours} / 70
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.max(0, 70 - stats.currentCycleHours)} hours remaining
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid
        size={{ xs: 12, md: 6, lg: 3 }}
        sx={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Card elevation={1} sx={{ height: "100%" }}>
          <CardHeader
            title={<Typography variant="subtitle2">Compliance Rate</Typography>}
            action={<BarChartIcon color="disabled" fontSize="small" />}
            sx={{ pb: 0 }}
          />
          <CardContent>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ color: complianceColor(stats.complianceRate) }}
            >
              {stats.complianceRate}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Last 7 days
            </Typography>
          </CardContent>
        </Card>
      </Grid>

      <Grid
        size={{ xs: 12, md: 6, lg: 3 }}
        sx={{ flex: 1, display: "flex", flexDirection: "column" }}
      >
        <Card elevation={1} sx={{ height: "100%" }}>
          <CardHeader
            title={<Typography variant="subtitle2">Violations</Typography>}
            action={<WarningAmberIcon color="disabled" fontSize="small" />}
            sx={{ pb: 0 }}
          />
          <CardContent>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{
                color:
                  stats.violationsThisWeek > 0 ? "error.main" : "primary.main",
              }}
            >
              {stats.violationsThisWeek}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This week
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
});

/* ---------- Tabs Content (unchanged) ---------- */

const TripsTab = memo(function TripsTab({ trips }: { trips: Trip[] }) {
  return (
    <Box>
      <Card elevation={0} sx={{ borderRadius: 2, bgcolor: "background.paper" }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" spacing={1}>
              <LocalShippingIcon color="primary" fontSize="small" />
              <Typography variant="h6">Recent Trips</Typography>
            </Stack>
          }
          subheader="Your most recent trips and their current status"
        />
        <CardContent>
          {trips.length > 0 ? <RecentTripsList trips={trips} /> : <NoTrips />}
        </CardContent>
      </Card>
    </Box>
  );
});

const RecentTripsList = memo(function RecentTripsList({
  trips,
}: {
  trips: Trip[];
}) {
  return (
    <Stack spacing={1.5}>
      {trips.slice(0, 5).map((trip) => (
        <TripRow key={trip.id} trip={trip} />
      ))}
    </Stack>
  );
});

const TripRow = memo(function TripRow({ trip }: { trip: Trip }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        bgcolor: (t) => alpha(t.palette.text.primary, 0.02),
        transition: "background-color 120ms ease",
        "&:hover": { bgcolor: (t) => alpha(t.palette.text.primary, 0.05) },
      }}
    >
      <Box sx={{ pr: 2, flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
          <Chip
            size="small"
            color={statusColor(trip.status) as any}
            label={trip.status?.toUpperCase?.() || "—"}
          />
          <Typography variant="caption" color="text.secondary">
            {trip.created_at
              ? new Date(trip.created_at).toLocaleDateString()
              : "—"}
          </Typography>
        </Stack>
        <Typography fontWeight={600}>
          {trip.pickup_location} → {trip.dropoff_location}
        </Typography>
        <Stack direction="row" spacing={3} mt={0.5}>
          {trip.trip_distance != null && (
            <Typography variant="body2" color="text.secondary">
              {trip.trip_distance.toLocaleString()} mi
            </Typography>
          )}
          {trip.estimated_duration != null && (
            <Typography variant="body2" color="text.secondary">
              {ELDLogEngine.formatDuration(trip.estimated_duration)}
            </Typography>
          )}
          {trip.current_cycle_hours != null && (
            <Typography variant="body2" color="text.secondary">
              {trip.current_cycle_hours}h cycle
            </Typography>
          )}
        </Stack>
      </Box>
      <Button
        component={RouterLink}
        to={`/trips/${trip.id}`}
        variant="outlined"
        size="small"
        startIcon={<VisibilityIcon />}
      >
        View
      </Button>
    </Box>
  );
});

const NoTrips = memo(function NoTrips() {
  return (
    <Stack alignItems="center" py={6} spacing={2}>
      <LocalShippingIcon sx={{ fontSize: 48 }} color="disabled" />
      <Typography color="text.secondary">No trips found</Typography>
      <Button
        component={RouterLink}
        to="/trips/new"
        variant="contained"
        startIcon={<AddIcon />}
      >
        Create Your First Trip
      </Button>
    </Stack>
  );
});

const LogsTab = memo(function LogsTab({ logs }: { logs: DailyLog[] }) {
  return (
    <Box>
      <Card elevation={0} sx={{ borderRadius: 2, bgcolor: "background.paper" }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" spacing={1}>
              <DescriptionIcon color="primary" fontSize="small" />
              <Typography variant="h6">Recent Daily Logs</Typography>
            </Stack>
          }
          subheader="Your daily log summaries for the past week"
        />
        <CardContent>
          {logs.length > 0 ? <LogsList logs={logs} /> : <NoLogs />}
        </CardContent>
      </Card>
    </Box>
  );
});

const LogsList = memo(function LogsList({ logs }: { logs: DailyLog[] }) {
  return (
    <Stack spacing={1.5}>
      {logs.map((log) => (
        <LogRow key={log.id} log={log} />
      ))}
    </Stack>
  );
});

const LogRow = memo(function LogRow({ log }: { log: DailyLog }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: (t) => alpha(t.palette.text.primary, 0.02),
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        mb={1}
      >
        <Typography fontWeight={600}>
          {new Date(log.log_date).toLocaleDateString()}
        </Typography>
        <Chip
          size="small"
          color={log.is_compliant ? "primary" : "error"}
          icon={log.is_compliant ? <CheckCircleIcon /> : <WarningAmberIcon />}
          label={log.is_compliant ? "Compliant" : "Violations"}
        />
      </Stack>
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Driving
          </Typography>
          <Typography fontWeight={600}>
            {ELDLogEngine.formatDuration(log.total_driving_time)}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Typography variant="caption" color="text.secondary">
            On-Duty
          </Typography>
          <Typography fontWeight={600}>
            {ELDLogEngine.formatDuration(log.total_on_duty_time)}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Off-Duty
          </Typography>
          <Typography fontWeight={600}>
            {ELDLogEngine.formatDuration(log.total_off_duty_time)}
          </Typography>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Typography variant="caption" color="text.secondary">
            Cycle Hours
          </Typography>
          <Typography fontWeight={600}>{log.cycle_hours_used}h</Typography>
        </Grid>
      </Grid>
      {log.violations?.length > 0 && (
        <Alert severity="error" sx={{ mt: 1, borderRadius: 2 }}>
          <Typography variant="body2" fontWeight={600} mb={0.5}>
            Violations:
          </Typography>
          <Stack spacing={0.5}>
            {log.violations.slice(0, 2).map((v, i) => (
              <Typography key={i} variant="caption">
                • {v.description}
              </Typography>
            ))}
            {log.violations.length > 2 && (
              <Typography variant="caption">
                • +{log.violations.length - 2} more violations
              </Typography>
            )}
          </Stack>
        </Alert>
      )}
    </Box>
  );
});

const NoLogs = memo(function NoLogs() {
  return (
    <Stack alignItems="center" py={6} spacing={2}>
      <DescriptionIcon sx={{ fontSize: 48 }} color="disabled" />
      <Typography color="text.secondary">No daily logs found</Typography>
    </Stack>
  );
});

const ComplianceTab = memo(function ComplianceTab({
  stats,
}: {
  stats: {
    totalTrips: number;
    activeTrips: number;
    completedTrips: number;
    currentCycleHours: number;
    complianceRate: number;
    violationsThisWeek: number;
  };
}) {
  return (
    <Box>
      <Card elevation={0} sx={{ borderRadius: 2, bgcolor: "background.paper" }}>
        <CardHeader
          title={
            <Stack direction="row" alignItems="center" spacing={1}>
              <BarChartIcon color="primary" fontSize="small" />
              <Typography variant="h6">Compliance Overview</Typography>
            </Stack>
          }
          subheader="Your HOS compliance status and recommendations"
        />
        <CardContent>
          <Grid container spacing={2} mb={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  textAlign: "center",
                  borderRadius: 2,
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.02),
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ color: complianceColor(stats.complianceRate) }}
                >
                  {stats.complianceRate}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Compliance Rate
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  textAlign: "center",
                  borderRadius: 2,
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.02),
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ color: cycleStatusColor(stats.currentCycleHours) }}
                >
                  {Math.max(0, 70 - stats.currentCycleHours)}h
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Hours Remaining
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Box
                sx={{
                  p: 2,
                  textAlign: "center",
                  borderRadius: 2,
                  bgcolor: (t) => alpha(t.palette.text.primary, 0.02),
                }}
              >
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{
                    color:
                      stats.violationsThisWeek > 0
                        ? "error.main"
                        : "primary.main",
                  }}
                >
                  {stats.violationsThisWeek}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Violations This Week
                </Typography>
              </Box>
            </Grid>
          </Grid>

          <Recommendations stats={stats} />
        </CardContent>
        <CardActions sx={{ px: 2, pb: 2 }}>
          <Button component={RouterLink} to="/logs" size="small">
            View full logs
          </Button>
        </CardActions>
      </Card>
    </Box>
  );
});

const Recommendations = memo(function Recommendations({
  stats,
}: {
  stats: {
    currentCycleHours: number;
    violationsThisWeek: number;
    complianceRate: number;
  };
}) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1" fontWeight={600}>
        Recommendations
      </Typography>

      {stats.currentCycleHours >= 60 && (
        <Alert severity="error">
          <Typography variant="body2" fontWeight={600}>
            Critical: Near 70-hour limit
          </Typography>
          <Typography variant="caption">
            You have only {Math.max(0, 70 - stats.currentCycleHours)} hours
            remaining in your 8-day cycle.
          </Typography>
        </Alert>
      )}

      {stats.currentCycleHours >= 50 && stats.currentCycleHours < 60 && (
        <Alert severity="warning" icon={<AccessTimeIcon />}>
          <Typography variant="body2" fontWeight={600}>
            Warning: High cycle hours
          </Typography>
          <Typography variant="caption">
            Plan for a 34-hour restart soon to reset your 8-day cycle.
          </Typography>
        </Alert>
      )}

      {stats.violationsThisWeek > 0 && (
        <Alert severity="error">
          <Typography variant="body2" fontWeight={600}>
            HOS Violations Detected
          </Typography>
          <Typography variant="caption">
            Review your recent logs and ensure proper rest periods.
          </Typography>
        </Alert>
      )}

      {stats.complianceRate >= 95 && stats.violationsThisWeek === 0 && (
        <Alert severity="success">
          <Typography variant="body2" fontWeight={600}>
            Excellent Compliance
          </Typography>
          <Typography variant="caption">
            Keep up the great work maintaining HOS compliance!
          </Typography>
        </Alert>
      )}
    </Stack>
  );
});
