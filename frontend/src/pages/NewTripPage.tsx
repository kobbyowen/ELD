import { Stack, Typography, Container } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { TripInputForm } from "../components/TripInputForm";
import { useAuth } from "../auth/AuthContext";
import { Navigate } from "react-router-dom";

export default function NewTripPage() {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/auth/login" replace />;

  return (
    <Container maxWidth="lg" sx={{ py: 6, px: { xs: 2, sm: 3 } }}>
      <Stack alignItems="center" spacing={1.5} mb={4} textAlign="center">
        <Stack direction="row" alignItems="center" spacing={1}>
          <LocalShippingIcon sx={{ color: "primary.main", fontSize: 32 }} />
          <Typography variant="h4" fontWeight={700}>
            Create New Trip
          </Typography>
        </Stack>
        <Typography variant="body1" color="text.secondary">
          Plan your route and generate ELD-compliant logs
        </Typography>
      </Stack>

      <TripInputForm />
    </Container>
  );
}
