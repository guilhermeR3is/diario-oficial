// Ancorado no fim da página: atos citam edições antigas com o mesmo cabeçalho no meio do texto
const PAGE_FOOTER =
  /\n?SÃO LUÍS\/MA \*[^\n]*\nEste documento pode ser verificado[^\n]*\n[^\n]*\n[^\n]*TCE\/MA\.\s*$/;

export function stripPageFooter(page: string): string {
  const body = page.replace(PAGE_FOOTER, "");
  if (body === page) {
    throw new Error(
      "page does not end with the newspaper header and signature footer",
    );
  }
  return body;
}
