import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Autocomplete,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  type TextFieldProps,
} from "@mui/material";
import { searchPlaces, type NomPlace } from "../lib/geocoding";

type Props = {
  value: string;
  onChange: (value: string, selected?: NomPlace) => void;
  placeholder?: string;
  size?: "small" | "medium";
  showLabel?: boolean;
  labelText?: string;
  labelIcon?: ReactNode;
  labelProps?: Partial<React.ComponentProps<typeof Typography>>;
  textFieldProps?: Partial<TextFieldProps>;
};

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  size = "small",
  showLabel = true,
  labelText,
  labelIcon,
  labelProps,
  textFieldProps,
}: Props) {
  const [input, setInput] = useState(value);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<Array<NomPlace & { label: string }>>(
    []
  );

  useEffect(() => setInput(value), [value]);

  const debounced = useDebounced(input, 300);

  useEffect(() => {
    let active = true;
    if (!debounced.trim()) {
      setOptions([]);
      return;
    }
    setLoading(true);
    searchPlaces(debounced, 8)
      .then((res) => active && setOptions(res))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [debounced]);

  return (
    <Stack spacing={0.75}>
      {showLabel && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
          {...labelProps}
        >
          {labelIcon}
          {labelText}
        </Typography>
      )}

      <Autocomplete
        freeSolo
        clearOnBlur={false}
        selectOnFocus
        handleHomeEndKeys
        fullWidth
        options={options}
        getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.label)}
        filterOptions={(x) => x}
        value={input}
        inputValue={input}
        onInputChange={(_, v) => {
          setInput(v);
          onChange(v);
        }}
        onChange={(_, v) => {
          if (typeof v === "string") {
            setInput(v);
            onChange(v);
          } else if (v) {
            setInput(v.label);
            onChange(v.label, v);
          } else {
            setInput("");
            onChange("");
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            size={size}
            {...textFieldProps}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        noOptionsText={debounced ? "No matches" : "Type to search"}
      />
    </Stack>
  );
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}
