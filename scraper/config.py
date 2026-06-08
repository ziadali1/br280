"""Configuração das rotas monitoradas.

Cada rota é uma direção. A captura roda as duas a cada execução.
Os endereços usam a string mais estável possível para o Google Maps
resolver sem ambiguidade (sempre com cidade + UF).
"""

# Ponto A: Rua Fernandes Dias, 322 - Centro - São Francisco do Sul
# Ponto B: Shopping Mueller Joinville - Centro - Joinville
PONTO_SFS = "Rua Fernandes Dias, 322 - Centro, São Francisco do Sul - SC"
PONTO_JOINVILLE = "Shopping Mueller Joinville, Centro, Joinville - SC"

ROUTES = [
    {
        "direction": "ida",
        "label": "São Francisco do Sul → Joinville",
        "origin": PONTO_SFS,
        "destination": PONTO_JOINVILLE,
    },
    {
        "direction": "volta",
        "label": "Joinville → São Francisco do Sul",
        "origin": PONTO_JOINVILLE,
        "destination": PONTO_SFS,
    },
]

# Fuso usado para todos os campos "local"
TIMEZONE = "America/Sao_Paulo"
