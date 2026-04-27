# ClamAV Configuration & Freshclam Guide

## Overview
Counter-Terrorist uses ClamAV for filesystem scanning. To ensure high detection rates, regular signature updates are required.

## Installation
```bash
sudo apt-get install clamav clamav-daemon
```

## Configuration
The `clamav-daemon` should be running for optimal performance.
Configuration is located at `/etc/clamav/clamd.conf`.

## Signature Updates
`freshclam` is the utility used to update signatures.
Edit `/etc/clamav/freshclam.conf` to configure update frequency.

## Custom Signature Sets
You can add custom signatures to `/var/lib/clamav/`.
Refer to ClamAV documentation for the signature format.
