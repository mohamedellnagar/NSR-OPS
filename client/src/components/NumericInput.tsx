import * as React from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { NumpadDialog } from "@/components/NumpadDialog";

interface NumericInputProps extends Omit<React.ComponentProps<typeof Input>, "type" | "inputMode"> {
  wrapperClassName?: string;
  numpadLabel?: string;
}

/**
 * NumericInput – wraps <Input type="number"> with:
 * - inputMode="decimal" for mobile numeric keyboard
 * - A keyboard icon that opens a Numpad popup dialog for easy number entry
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, wrapperClassName, numpadLabel, value, onChange, ...props }, ref) => {
    const [numpadOpen, setNumpadOpen] = React.useState(false);
    const [numpadValue, setNumpadValue] = React.useState("");

    const handleIconClick = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Initialize numpad with current field value
      setNumpadValue(String(value ?? ""));
      setNumpadOpen(true);
    };

    const handleNumpadConfirm = () => {
      if (onChange) {
        // Simulate a synthetic change event
        const syntheticEvent = {
          target: { value: numpadValue },
          currentTarget: { value: numpadValue },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    };

    return (
      <div className={cn("relative", wrapperClassName)}>
        <Input
          ref={ref}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          className={cn("pr-8", className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={handleIconClick}
          onTouchEnd={handleIconClick}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary active:text-primary transition-colors cursor-pointer p-0.5 rounded touch-manipulation z-10"
          aria-label="فتح لوحة الأرقام"
        >
          <Keyboard size={13} />
        </button>

        <NumpadDialog
          open={numpadOpen}
          onOpenChange={setNumpadOpen}
          value={numpadValue}
          onValueChange={setNumpadValue}
          onConfirm={handleNumpadConfirm}
          label={numpadLabel}
        />
      </div>
    );
  }
);

NumericInput.displayName = "NumericInput";

export { NumericInput };
