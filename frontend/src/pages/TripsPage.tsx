import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import GetAppIcon from "@mui/icons-material/GetApp";
import AddIcon from "@mui/icons-material/Add";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { apiFetch } from "../lib/api";

function stripFirstName(locationName: string): string {
  if (!locationName) return locationName;
  if (locationName.toLowerCase().includes("location")) return locationName;

  return locationName.split(",")[0].trim();
}

type TripCalcPayload = {
  route: { distance_m: number; duration_s: number; geometry?: any };
  places: {
    current: { name: string };
    dropoff: { name: string };
    pickup: { name: string };
  };
  stops: Array<{
    id: string;
    type: "pickup" | "dropoff" | "break" | "fuel" | "rest";
    etaIso: string;
    coord: { lat: number; lng: number };
    durationMin: number;
    note?: string;
    poi?: { name?: string | null };
  }>;
  stats?: any;
};

type TripExtras = {
  log_date?: string;
  from_location?: string;
  to_location?: string;
  equipment_text?: string;
  carrier_name?: string;
  main_office_address?: string;
  home_terminal_address?: string;
  remarks?: string;
};

type TripData = {
  id: string;
  user: string;
  calc_payload: TripCalcPayload;
  extras: TripExtras;
  created_at: string;
  updated_at: string;
};

type TripApi = {
  results: TripData[];
  count: number;
};

type RowActionMenuProps = {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onView: () => void;
  onDelete: () => void;
  onDownloadZip: () => void;
  onDownloadPdf: () => void;
  onDownloadPng: () => void;
  onDownloadHtml: () => void;
};

function RowActionMenu({
  anchorEl,
  onClose,
  onView,
  onDelete,
  onDownloadZip,
  onDownloadPdf,
  onDownloadPng,
  onDownloadHtml,
}: RowActionMenuProps) {
  const open = Boolean(anchorEl);
  return (
    <Menu anchorEl={anchorEl} open={open} onClose={onClose}>
      <MenuItem onClick={onView}>
        <VisibilityIcon fontSize="small" style={{ marginRight: 8 }} />
        View
      </MenuItem>
      <MenuItem onClick={onDownloadZip}>
        <GetAppIcon fontSize="small" style={{ marginRight: 8 }} />
        Download All (ZIP)
      </MenuItem>
      <MenuItem onClick={onDownloadPdf}>
        <GetAppIcon fontSize="small" style={{ marginRight: 8 }} />
        Download PDF
      </MenuItem>
      <MenuItem onClick={onDownloadPng}>
        <GetAppIcon fontSize="small" style={{ marginRight: 8 }} />
        Download PNG
      </MenuItem>
      <MenuItem onClick={onDownloadHtml}>
        <GetAppIcon fontSize="small" style={{ marginRight: 8 }} />
        Download HTML
      </MenuItem>
      <MenuItem onClick={onDelete} sx={{ color: "error.main" }}>
        <DeleteIcon fontSize="small" style={{ marginRight: 8 }} />
        Delete
      </MenuItem>
    </Menu>
  );
}

function useTrips() {
  const [trips, setTrips] = useState<TripData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/trips", { method: "GET" });
      if (!res.ok) throw new Error(`Failed to load trips (${res.status})`);
      const data: TripApi = await res.json();

      setTrips(data.results);
    } catch (e: any) {
      setError(e?.message || "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { trips, setTrips, loading, error, reload: load };
}

function formatMiles(meters?: number) {
  if (!meters && meters !== 0) return "—";
  const mi = meters / 1609.344;
  return `${(Math.round(mi * 10) / 10).toLocaleString()} mi`;
}

function formatDuration(seconds?: number) {
  if (!seconds && seconds !== 0) return "—";
  const totalMin = Math.round(seconds / 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh}h ${mm}m`;
}

function makeDownloadUrl(id: string, format: "zip" | "pdf" | "png" | "html") {
  return `/api/trips/${id}/download?format=${format}`;
}

export default function TripsPage() {
  const { trips, setTrips, loading, error, reload } = useTrips();
  const navigate = useNavigate();

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTripId, setMenuTripId] = useState<string | null>(null);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  //   const confirmTrip = useMemo(
  //     () => trips.find((t) => t.id === confirmId),
  //     [confirmId, trips]
  //   );

  const handleOpenMenu = (id: string) => (e: React.MouseEvent<HTMLElement>) => {
    setMenuTripId(id);
    setMenuAnchor(e.currentTarget);
  };
  const handleCloseMenu = () => {
    setMenuTripId(null);
    setMenuAnchor(null);
  };

  const handleView = () => {
    if (!menuTripId) return;
    navigate(`/trips/${menuTripId}`);
    handleCloseMenu();
  };

  const startDownload = (format: "zip" | "pdf" | "png" | "html") => () => {
    if (!menuTripId) return;
    const url = makeDownloadUrl(menuTripId, format);
    window.location.href = url; // let the browser handle file download
    handleCloseMenu();
  };

  const askDelete = () => {
    if (!menuTripId) return;
    setConfirmId(menuTripId);
    handleCloseMenu();
  };
  const cancelDelete = () => setConfirmId(null);

  const doDelete = async () => {
    if (!confirmId) return;
    try {
      const res = await apiFetch(`/api/trips/${confirmId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setTrips((prev) => prev.filter((t) => t.id !== confirmId));
    } catch (e: any) {
      await reload();
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <Box sx={{ maxWidth: "lg", mx: "auto", px: { xs: 2, md: 3 }, py: 4 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700}>
            Trips
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View, download, or delete your trips
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/dashboard"
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
          to="/trips/new"
          variant="contained"
          startIcon={<AddIcon />}
        >
          New Trip
        </Button>
      </Stack>

      <Card elevation={1}>
        <CardHeader title="All Trips" />
        <CardContent>
          {loading ? (
            <Stack alignItems="center" py={6}>
              <CircularProgress />
            </Stack>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : trips.length === 0 ? (
            <Stack alignItems="center" py={6} spacing={2}>
              <Typography color="text.secondary">
                No trips yet. Create your first trip.
              </Typography>
              <Button
                component={RouterLink}
                to="/trips/new"
                variant="contained"
                startIcon={<AddIcon />}
              >
                New Trip
              </Button>
            </Stack>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>From → To</TableCell>
                    <TableCell>Distance</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trips.map((t) => {
                    const miles = formatMiles(
                      t.calc_payload?.route?.distance_m
                    );
                    const dur = formatDuration(
                      t.calc_payload?.route?.duration_s
                    );
                    const from = stripFirstName(
                      t?.calc_payload?.places?.current?.name || "-"
                    );
                    const to = stripFirstName(
                      t?.calc_payload?.places?.dropoff?.name || "-"
                    );
                    const created = new Date(t.created_at).toLocaleString();

                    return (
                      <TableRow key={t.id} hover>
                        <TableCell>{created}</TableCell>
                        <TableCell>
                          <Typography component="span" fontWeight={600}>
                            {from}
                          </Typography>{" "}
                          →{" "}
                          <Typography component="span" fontWeight={600}>
                            {to}
                          </Typography>
                        </TableCell>
                        <TableCell>{miles}</TableCell>
                        <TableCell>{dur}</TableCell>
                        <TableCell>{created}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            aria-label="actions"
                            onClick={handleOpenMenu(t.id)}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <RowActionMenu
        anchorEl={menuAnchor}
        onClose={handleCloseMenu}
        onView={handleView}
        onDelete={askDelete}
        onDownloadZip={startDownload("zip")}
        onDownloadPdf={startDownload("pdf")}
        onDownloadPng={startDownload("png")}
        onDownloadHtml={startDownload("html")}
      />

      <Dialog open={Boolean(confirmId)} onClose={cancelDelete}>
        <DialogTitle>Delete Trip?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete the trip and its generated artifacts.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDelete}>Cancel</Button>
          <Button
            onClick={doDelete}
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
