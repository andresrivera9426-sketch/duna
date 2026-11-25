# Genera un PDF de prueba mínimo (sin dependencias) para probar la lectura de documentos de IA DUNA
import sys
lines=["CONTRATO DE ARRIENDO - Puerto Asis","Arrendatario: Ana Prueba","Canon mensual: $1.250.000","Inicio: 1 de diciembre de 2026","Duracion: 12 meses","Pago: primeros 5 dias de cada mes"]
txt="BT /F1 14 Tf 60 760 Td 18 TL "+" ".join("(%s) '"%l for l in lines)+" ET"
objs=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
"<< /Length %d >>\nstream\n%s\nendstream"%(len(txt),txt),"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
out=b"%PDF-1.4\n"; offs=[]
for i,o in enumerate(objs): offs.append(len(out)); out+=("%d 0 obj\n%s\nendobj\n"%(i+1,o)).encode()
x=len(out); out+=("xref\n0 %d\n0000000000 65535 f \n"%(len(objs)+1)).encode()+b"".join(("%010d 00000 n \n"%o).encode() for o in offs)
out+=("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n"%(len(objs)+1,x)).encode()
open(sys.argv[1],'wb').write(out)
