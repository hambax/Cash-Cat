import { ExternalLink } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Personal apps and tokens are created from the Akahu developer area. */
const AKAHU_DEVELOPERS_URL = "https://my.akahu.nz/developers";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GetStartedDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  function continueToSettings() {
    onOpenChange(false);
    navigate("/settings#akahu");
    window.setTimeout(() => {
      document.getElementById("akahu")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 rounded-2xl p-0 sm:max-w-lg">
        <div className="space-y-4 p-6 pb-4">
          <DialogHeader className="space-y-2 text-left">
            <DialogTitle className="pr-8 text-xl leading-snug">Welcome to Cash Cat</DialogTitle>
            <DialogDescription className="sr-only">
              Connect your New Zealand bank data, then use categories and filters to understand your spending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              Cash Cat helps you see where your money goes without juggling spreadsheets every week. Your data stays on
              this device—see{" "}
              <Link to="/settings" className="text-primary underline underline-offset-2" onClick={() => onOpenChange(false)}>
                Settings
              </Link>{" "}
              for import and connection options.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Bring transactions in.</strong> Connect supported NZ accounts via Akahu
                (below) or import CSV from your bank.
              </li>
              <li>
                <strong className="text-foreground">Tidy categories.</strong> On{" "}
                <Link to="/categories" className="text-primary underline underline-offset-2" onClick={() => onOpenChange(false)}>
                  Categories
                </Link>
                , add simple matching rules or adjust labels so spending sorts the way you think about it.
              </li>
              <li>
                <strong className="text-foreground">Slice the dashboard.</strong> Use the date range and “What’s included”
                switches on the home screen to include or exclude accounts and spending types—totals update to match.
              </li>
            </ol>
            <p>
              To pull transactions automatically, create a <strong className="text-foreground">personal app</strong> at
              Akahu and paste your <strong className="text-foreground">App ID</strong> and{" "}
              <strong className="text-foreground">user access token</strong> into Cash Cat.
            </p>
          </div>
        </div>
        <DialogFooter className="flex w-full flex-col gap-2 border-t border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <Button asChild className="w-full shrink-0 gap-2 rounded-xl sm:w-auto">
            <a href={AKAHU_DEVELOPERS_URL} target="_blank" rel="noopener noreferrer">
              Open Akahu Developers
              <ExternalLink className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            </a>
          </Button>
          <Button type="button" variant="secondary" className="w-full shrink-0 rounded-xl sm:w-auto" onClick={continueToSettings}>
            Continue to Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
