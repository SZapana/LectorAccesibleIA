#!/usr/bin/env python3
"""
Proxy local para VoiceStudio.
Recibe peticiones de la extensión (sin Origin válido) y las reenvía a VoiceStudio
con el header Origin correcto.
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import urllib.request
import urllib.error
import sys

VOICESTUDIO_URL = "http://127.0.0.1:3900/v1/audio/speech"
VOICESTUDIO_ORIGIN = "http://127.0.0.1:3901"
PROXY_PORT = 3902

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "upstream": VOICESTUDIO_URL,
                "voice": "df54e121",
            }).encode())
            return
        self.send_response(404)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def do_POST(self):
        if self.path != '/v1/audio/speech':
            self.send_response(404)
            self.end_headers()
            return

        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            print(f"[PROXY] Recibida petición POST, body length: {len(body)}")
            
            # Forward to VoiceStudio with correct Origin
            req = urllib.request.Request(
                'http://127.0.0.1:3900/v1/audio/speech',
                data=body,
                headers={
                    'Content-Type': 'application/json',
                    'Origin': 'http://127.0.0.1:3901'
                },
                method='POST'
            )
            
            print("[PROXY] Enviando a VoiceStudio...")
            with urllib.request.urlopen(req, timeout=300) as resp:
                print(f"[PROXY] VoiceStudio respondió: {resp.status}")
                self.send_response(resp.status)
                for header, value in resp.headers.items():
                    if header.lower() not in ('content-encoding', 'transfer-encoding',
                                            'access-control-allow-origin'):
                        self.send_header(header, value)
                # La extension corre en chrome-extension://<id>; el ACAO que
                # devuelve VoiceStudio apunta a http://127.0.0.1:3901 y el
                # navegador lo rechazaria. Se reemplaza por un comodin.
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Expose-Headers', '*')
                self.end_headers()
                self.wfile.write(resp.read())
                
        except urllib.error.HTTPError as e:
            print(f"[PROXY] HTTPError: {e.code}")
            self.send_response(e.code)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            print(f"[PROXY] Error: {e}")
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(str(e).encode())

    def log_message(self, format, *args):
        print(f"[PROXY] {format % args}")

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 3902), ProxyHandler)
    print(f"[PROXY] Iniciado en http://127.0.0.1:3902")
    print(f"[PROXY] Forwarding a VoiceStudio: http://127.0.0.1:3900/v1/audio/speech")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PROXY] Detenido")
        server.server_close()