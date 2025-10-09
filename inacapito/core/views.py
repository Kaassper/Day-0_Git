from django.shortcuts import render

# === Autenticación ===
def login_view(request):
    return render(request, 'login.html')

def registro_view(request):
    return render(request, 'registro.html')

# === Vistas de Alumno ===
def panel_alumno(request):
    return render(request, 'alumno/panel.html')

def ruta_general(request):
    return render(request, 'alumno/ruta-general.html')

def ruta_especifica(request):
    return render(request, 'alumno/ruta-especifica.html')

def modulo_view(request):
    return render(request, 'alumno/modulo.html')

def quiz_view(request):
    return render(request, 'alumno/quiz.html')

def eventos_alumno(request):
    return render(request, 'alumno/eventos.html')

# === Vistas de Administrador ===
def panel_admin(request):
    return render(request, 'admin/panel.html')

def eventos_admin(request):
    return render(request, 'admin/eventos.html')
