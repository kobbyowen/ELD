import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Autocomplete,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  type TextFieldProps,
} from "@mui/material";
import { searchPlaces, type NomPlace } from "../lib/geocoding";
import { useDebounced } from "../hooks/useDebounced";

type Opt = NomPlace & { label: string };

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
  const [options, setOptions] = useState<Opt[]>([]);

  useEffect(() => {
    setInput(value);
  }, [value]);

  const debounced = useDebounced(input, 300);

  useEffect(() => {
    let active = true;
    if (!debounced.trim()) {
      setOptions([]);
      return;
    }
    setLoading(true);
    searchPlaces(debounced, 8)
      .then((res) => {
        if (active) setOptions(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  const getOptionLabel = useCallback((opt: string | Opt) => {
    return typeof opt === "string" ? opt : opt.label;
  }, []);

  const filterOptions = useCallback((x: Opt[]) => x, []);

  const handleInputChange = useCallback(
    (_: unknown, v: string) => {
      setInput(v);
      onChange(v);
    },
    [onChange]
  );

  const handleOptionChange = useCallback(
    (_: unknown, v: string | Opt | null) => {
      if (typeof v === "string") {
        setInput(v);
        onChange(v);
        return;
      }
      if (v) {
        setInput(v.label);
        onChange(v.label, v);
        return;
      }
      setInput("");
      onChange("");
    },
    [onChange]
  );

  const renderInput = useCallback(
    (params: any) => (
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
    ),
    [loading, placeholder, size, textFieldProps]
  );

  const noOptionsText = useMemo(
    () => (debounced ? "No matches" : "Type to search"),
    [debounced]
  );

  return (
    <Stack spacing={0.75} sx={{ flex: 1 }}>
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
        value={input}
        inputValue={input}
        getOptionLabel={getOptionLabel}
        filterOptions={filterOptions}
        onInputChange={handleInputChange}
        onChange={handleOptionChange}
        renderInput={renderInput}
        noOptionsText={noOptionsText}
      />
    </Stack>
  );
}
