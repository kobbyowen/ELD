import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(err?.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: { xs: 3, md: 5 },
        bgcolor: "background.default",
      }}
    >
      <Box sx={{ width: "100%" }}>
        <Card
          elevation={2}
          sx={{
            bgcolor: "background.paper",
            borderRadius: 3,
          }}
        >
          <CardHeader
            title={
              <Stack alignItems="center" spacing={1}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <LocalShippingIcon sx={{ color: "primary.main" }} />
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    color="text.primary"
                  >
                    ELD Login
                  </Typography>
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  Enter your credentials to access your ELD dashboard
                </Typography>
              </Stack>
            }
            sx={{ textAlign: "center", pb: 0, pt: 4 }}
          />
          <CardContent sx={{ pt: 3, pb: 4 }}>
            <Box component="form" onSubmit={handleLogin}>
              <Stack spacing={3}>
                {error && <Alert severity="error">{error}</Alert>}

                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Email
                  </Typography>
                  <TextField
                    id="email"
                    type="email"
                    placeholder="driver@company.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    fullWidth
                    size="medium"
                  />
                </Stack>

                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary">
                    Password
                  </Typography>
                  <TextField
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPwd(e.target.value)}
                    fullWidth
                    size="medium"
                  />
                </Stack>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </Stack>

              <Typography variant="body2" align="center" sx={{ mt: 3 }}>
                {"Don't have an account? "}{" "}
                <Button
                  component={RouterLink}
                  to="/auth/sign-up"
                  variant="text"
                  sx={{ p: 0, minWidth: 0, textTransform: "none" }}
                >
                  Sign up
                </Button>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
