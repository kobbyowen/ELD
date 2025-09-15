import React from "react";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import NewTripPage from "./pages/NewTripPage";
import SignUpPage from "./pages/SignUpPage";
import TripsPage from "./pages/TripsPage";
import TripViewPage from "./pages/TripViewPage";

const theme = createTheme();
function Protected({ children }: { children: React.ReactElement }) {
  const { authed } = useAuth();
  const location = useLocation();
  if (!authed)
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/auth/sign-up" element={<SignUpPage />} />
      <Route path="/trips/new" element={<NewTripPage />} />
      <Route path="/trips" element={<TripsPage />} />
      <Route path="/trips/:id" element={<TripViewPage />} />
      <Route path="*" element={<Navigate to="/auth/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
