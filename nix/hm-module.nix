# Home-manager module for Szeptucha speech-to-text
#
# Provides a systemd user service for autostart.
# Usage: imports = [ szeptucha.homeManagerModules.default ];
#        services.szeptucha.enable = true;
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.szeptucha;
in
{
  options.services.szeptucha = {
    enable = lib.mkEnableOption "Szeptucha speech-to-text user service";

    package = lib.mkOption {
      type = lib.types.package;
      defaultText = lib.literalExpression "szeptucha.packages.\${system}.szeptucha";
      description = "The Szeptucha package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.user.services.szeptucha = {
      Unit = {
        Description = "Szeptucha speech-to-text";
        After = [ "graphical-session.target" ];
        PartOf = [ "graphical-session.target" ];
      };
      Service = {
        ExecStart = "${cfg.package}/bin/szeptucha";
        Restart = "on-failure";
        RestartSec = 5;
      };
      Install.WantedBy = [ "graphical-session.target" ];
    };
  };
}
