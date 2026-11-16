import { Link, useLocation } from "react-router";
import { BookOpenIcon, LayoutDashboardIcon } from "lucide-react";
import { UserButton } from "@clerk/react";

function Navbar() {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="bg-base-100/80 backdrop-blur-md border-b border-orange-500/20 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* LOGO */}
        <Link
          to="/"
          className="group flex items-center gap-3 hover:scale-105 transition-transform duration-200"
        >
          <img src="/logo.png" alt="Logo" className="size-14 object-contain" />

          <div className="flex flex-col">
            <span className="font-black text-xl bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent font-mono tracking-wider">
              Interview Caller
            </span>
            <span className="text-xs text-base-content/60 font-medium -mt-1">
              Coding Together
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1">
          {/* PROBLEMS PAGE LINK */}
          <Link
            to={"/problems"}
            className={`px-4 py-2.5 rounded-lg transition-all duration-200 ${
              isActive("/problems")
                ? "bg-gradient-to-r from-red-600 to-orange-500 text-white"
                : "hover:bg-base-200 text-base-content/70 hover:text-base-content"
            }`}
          >
            <div className="flex items-center gap-x-2.5">
              <BookOpenIcon className="size-4" />
              <span className="font-medium hidden sm:inline">Problems</span>
            </div>
          </Link>

          {/* DASHBOARD PAGE LINK */}
          <Link
            to={"/dashboard"}
            className={`px-4 py-2.5 rounded-lg transition-all duration-200 ${
              isActive("/dashboard")
                ? "bg-gradient-to-r from-red-600 to-orange-500 text-white"
                : "hover:bg-base-200 text-base-content/70 hover:text-base-content"
            }`}
          >
            <div className="flex items-center gap-x-2.5">
              <LayoutDashboardIcon className="size-4" />
              <span className="font-medium hidden sm:inline">Dashboard</span>
            </div>
          </Link>

          <div className="ml-4 mt-2">
            <UserButton />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;