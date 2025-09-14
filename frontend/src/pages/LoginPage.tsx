import { useState, useCallback, memo } from "react";
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

  const handleEmail = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handlePassword = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPwd(e.target.value);
    },
    []
  );

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
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
    },
    [email, password, login, navigate]
  );

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
          sx={{ bgcolor: "background.paper", borderRadius: 3 }}
        >
          <CardHeader
            title={<HeaderTitle />}
            sx={{ textAlign: "center", pb: 0, pt: 4 }}
          />
          <CardContent sx={{ pt: 3, pb: 4 }}>
            <Box component="form" onSubmit={handleLogin}>
              <Stack spacing={3}>
                {error && <Alert severity="error">{error}</Alert>}

                <LabeledField label="Email">
                  <TextField
                    id="email"
                    type="email"
                    placeholder="driver@company.com"
                    required
                    value={email}
                    onChange={handleEmail}
                    fullWidth
                    size="medium"
                  />
                </LabeledField>

                <LabeledField label="Password">
                  <TextField
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={handlePassword}
                    fullWidth
                    size="medium"
                  />
                </LabeledField>

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
                {"Don't have an account? "}
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

const HeaderTitle = memo(function HeaderTitle() {
  return (
    <Stack alignItems="center" spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <LocalShippingIcon sx={{ color: "primary.main" }} />
        <Typography variant="h5" fontWeight={700} color="text.primary">
          ELD Login
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" align="center">
        Enter your credentials to access your ELD dashboard
      </Typography>
    </Stack>
  );
});

function LabeledField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {children}
    </Stack>
  );
}
