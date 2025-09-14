import { Avatar, IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import React from "react";

function initialsFromName(first?: string, last?: string, email?: string) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  if (f || l) return `${f?.[0] ?? ""}${l?.[0] ?? ""}`.toUpperCase();
  const e = (email || "").trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return "U";
}

export function UserAvatarMenu({
  firstName,
  lastName,
  email,
}: {
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleOpen = React.useCallback((e: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(e.currentTarget);
  }, []);
  const handleClose = React.useCallback(() => setAnchorEl(null), []);
  const handleLogout = React.useCallback(async () => {
    handleClose();
    await logout();
    navigate("/auth/login", { replace: true });
  }, [logout, navigate, handleClose]);

  const initials = initialsFromName(firstName, lastName, email);

  return (
    <>
      <Tooltip title="Account">
        <IconButton onClick={handleOpen} size="small" sx={{ ml: 1 }}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: (t) => t.palette.primary.main,
              color: (t) => t.palette.primary.contrastText,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {initials}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <MenuItem onClick={handleLogout}>Logout</MenuItem>
      </Menu>
    </>
  );
}
