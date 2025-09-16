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
  if (!authed) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/sign-up" element={<SignUpPage />} />

      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/trips/new"
        element={
          <Protected>
            <NewTripPage />
          </Protected>
        }
      />
      <Route
        path="/trips"
        element={
          <Protected>
            <TripsPage />
          </Protected>
        }
      />
      <Route
        path="/trips/:id"
        element={
          <Protected>
            <TripViewPage />
          </Protected>
        }
      />
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
