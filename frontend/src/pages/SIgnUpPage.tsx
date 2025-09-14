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
import Grid from "@mui/material/Grid";
import { apiFetch } from "../lib/api";

export default function SignUpPage() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    repeatPassword: "",
    firstName: "",
    lastName: "",
    licenseNumber: "",
    carrierName: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = useCallback(
    (field: keyof typeof formData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const bindField = useCallback(
    (field: keyof typeof formData) =>
      (e: React.ChangeEvent<HTMLInputElement>) =>
        handleInputChange(field, e.target.value),
    [handleInputChange]
  );

  const compactFieldProps = {
    size: "small" as const,
    margin: "dense" as const,
    fullWidth: true,
    sx: { "& .MuiInputBase-input": { py: 0.75 } },
  };

  const handleSignUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!formData.firstName.trim()) return setError("First name is required");
      if (!formData.lastName.trim()) return setError("Last name is required");
      if (!formData.email.trim()) return setError("Email is required");
      if (!formData.licenseNumber.trim())
        return setError("CDL License Number is required");
      if (formData.password.length < 6)
        return setError("Password must be at least 6 characters");
      if (formData.password !== formData.repeatPassword)
        return setError("Passwords do not match");

      setIsLoading(true);
      try {
        const res = await apiFetch("/auth/signup", {
          method: "POST",
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            first_name: formData.firstName,
            last_name: formData.lastName,
            license_number: formData.licenseNumber,
            carrier_name: formData.carrierName,
          }),
        });

        if (!res.ok) {
          let message = "Sign up failed";
          try {
            const data = await res.json();
            if (data?.errors) {
              const firstKey = Object.keys(data.errors)[0];
              const firstMsg = Array.isArray(data.errors[firstKey])
                ? data.errors[firstKey][0]
                : data.errors[firstKey];
              message = `${firstMsg}`;
            } else {
              message = data?.detail || data?.error || JSON.stringify(data);
            }
          } catch {
            // keep default message
          }
          throw new Error(message);
        }

        navigate("/auth/login", { replace: true });
      } catch (err: any) {
        setError(err?.message || "An error occurred");
      } finally {
        setIsLoading(false);
      }
    },
    [formData, navigate]
  );

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: { xs: 2, md: 4 },
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
            sx={{ textAlign: "center", pb: 0, pt: 3 }}
          />
          <CardContent sx={{ pt: 2, pb: 3 }}>
            <Box component="form" onSubmit={handleSignUp}>
              <Stack spacing={1.5}>
                <Grid container spacing={1.5} sx={{ flex: 1 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <LabeledInput label="First Name">
                      <TextField
                        id="firstName"
                        required
                        value={formData.firstName}
                        onChange={bindField("firstName")}
                        {...compactFieldProps}
                      />
                    </LabeledInput>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <LabeledInput label="Last Name">
                      <TextField
                        id="lastName"
                        required
                        value={formData.lastName}
                        onChange={bindField("lastName")}
                        {...compactFieldProps}
                      />
                    </LabeledInput>
                  </Grid>
                </Grid>

                <LabeledInput label="Email">
                  <TextField
                    id="email"
                    type="email"
                    placeholder="driver@company.com"
                    required
                    value={formData.email}
                    onChange={bindField("email")}
                    {...compactFieldProps}
                  />
                </LabeledInput>

                <LabeledInput label="CDL License Number">
                  <TextField
                    id="licenseNumber"
                    required
                    value={formData.licenseNumber}
                    onChange={bindField("licenseNumber")}
                    {...compactFieldProps}
                  />
                </LabeledInput>

                <LabeledInput label="Carrier/Company Name">
                  <TextField
                    id="carrierName"
                    value={formData.carrierName}
                    onChange={bindField("carrierName")}
                    {...compactFieldProps}
                  />
                </LabeledInput>

                <LabeledInput label="Password">
                  <TextField
                    id="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={bindField("password")}
                    {...compactFieldProps}
                  />
                </LabeledInput>

                <LabeledInput label="Confirm Password">
                  <TextField
                    id="repeat-password"
                    type="password"
                    required
                    value={formData.repeatPassword}
                    onChange={bindField("repeatPassword")}
                    {...compactFieldProps}
                  />
                </LabeledInput>

                {error && (
                  <Alert severity="error" sx={{ mt: 0.5 }}>
                    {error}
                  </Alert>
                )}

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="medium"
                  disabled={isLoading}
                  sx={{ mt: 0.5 }}
                >
                  {isLoading ? "Creating account..." : "Create Account"}
                </Button>
              </Stack>

              <Typography variant="body2" align="center" sx={{ mt: 2 }}>
                Already have an account?{" "}
                <Button
                  component={RouterLink}
                  to="/auth/login"
                  variant="text"
                  size="small"
                  sx={{ p: 0, minWidth: 0, textTransform: "none" }}
                >
                  Sign in
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
    <Stack alignItems="center" spacing={0.75}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
        <LocalShippingIcon sx={{ color: "primary.main" }} />
        <Typography variant="h6" fontWeight={700} color="text.primary">
          Create ELD Account
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" align="center">
        Register as a professional driver
      </Typography>
    </Stack>
  );
});

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {children}
    </Stack>
  );
}
