// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Windrose
/* Local CAN bench for the Windrose read page. Same rules as canbench.py.
   A DBC stays in this browser. Outbound frames are read-only questions.
   On open, name the dongle. You do not pick Peak or ZLG.
   CAN XL is not implemented. CANBENCH_REV 2026-10-24.5
   One language at a time, the same list as windrose.ai. English is the fallback. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Canbench = api;
})(typeof self !== "undefined" ? self : this, function () {
  var PGN_NAMES = {
    9472: "Multi-PG", 19712: "FD.TP.CM", 19968: "FD.TP.DT", 59904: "Request",
    60160: "TP.DT", 60416: "TP.CM", 60928: "Address Claim", 61444: "EEC1",
    65217: "HOURS", 65226: "DM1", 65227: "DM2", 65228: "DM3", 65229: "DM4",
    65230: "DM5", 65231: "DM6", 65235: "DM11", 65236: "DM12",
    65242: "Software ID", 65259: "Component ID", 65260: "VIN", 65262: "ET1", 65265: "CCVS1"
  };
  var READ_PGN = {65226:1, 65227:1, 65229:1, 65230:1, 65231:1, 65236:1, 65260:1, 65259:1, 65242:1, 60928:1};
  var READ_NAME = {dm1:65226, dm2:65227, dm4:65229, dm5:65230, dm6:65231, dm12:65236, vin:65260, component:65259, software:65242, address:60928};

  var WH13_FUNCTIONAL = 0x18dbfff1;
  var UDS_ASK = {0x10:1, 0x19:1, 0x22:1, 0x3E:1};
  var OBD_READ = {0x01:1, 0x02:1, 0x03:1, 0x05:1, 0x06:1, 0x07:1, 0x09:1, 0x0A:1};
  var BLOCKED = {
    0x04:1, 0x08:1, 0x11:1, 0x14:1, 0x27:1, 0x28:1, 0x29:1, 0x2A:1, 0x2C:1,
    0x2E:1, 0x2F:1, 0x31:1, 0x34:1, 0x35:1, 0x36:1, 0x37:1, 0x38:1, 0x3D:1,
    0x83:1, 0x84:1, 0x85:1, 0x86:1, 0x87:1
  };
  var I18N = {"langs":["en","zh","zh_tw","fr","de","es","it","pt","nl","pl","sv","da","no","fi","is","tr","ar","he","ja","ko"],"copy":{"en":{"ask_only":"You can ask. You cannot change.","bus_note":"Asking only. Nothing on the truck is changed. CAN XL is not available on PCAN-USB FD.","not_a_question":"This frame is not a read-only question. Clear, reset, write, flash, security access, and control are not sent.","plain_boundary":"This tool only asks for data. It will not write, flash, unlock, or command the vehicle.","plain_nothing":"Nothing is plugged in. Plug a USB-CAN dongle into this computer. You do not need to know if it is Peak, ZLG, or another brand.","plain_driver":"The adapter driver is missing. Install the driver that came with the dongle, then plug it in again. You do not need to choose Peak or ZLG.","plain_bitrate":"The dongle is at the wrong bitrate. The diagnostic plug needs classic CAN at 500 kbit/s.","plain_power":"The vehicle bus has no power, or the diagnostic cable is not seated. Turn the ignition on and check OBD pins 6 and 14.","plug_brand":"Plug in a USB-CAN dongle. You do not need to know the brand.","help_plug":"Plug in a USB-CAN dongle, then: connect","help_brand":"You do not need to know if it is Peak, ZLG, or another brand.","help_lang":"One language at a time, from WR_LANG or --lang, the same list as windrose.ai. English when that is empty or unknown.","found":"Found: %s.","asked":"Asked %s for session, fault codes, and VIN on 0x18DBFFF1. Nothing on the vehicle was changed.","heard":"Heard traffic and decoded it with the public dictionary.","quiet_bus":"No messages came back. Turn the ignition on and seat the cable on the diagnostic plug.","uds_50":"diagnostic session","uds_59":"fault information","uds_62":"data value","uds_7e":"tester still present","uds_7f":"the vehicle declined the question","uds_locked":"the vehicle asked for a security unlock. This tool will not unlock it.","response":"Response 0x%X: %s.","response_unknown":"Response 0x%X: %d bytes, not in the public dictionary.","plot_note":"Plug in a USB-CAN dongle. You do not need to know the brand. CAN adapter (Peak, ZLG, …). Local file. It is not sent to the assistant. Read-only questions only; the vehicle is not changed.","plot_empty":"No signal in this recording changed value.","plugged_in":"Plugged in: %s.","uds_bus":"UDS asks go out on the diagnostic CAN only (OBD pins 6/14, classic 500 kbit/s via TGW / GWCANFD9, 29-bit functional 0x18DBFFF1 or physical 0x18DAxxF1)."},"zh":{"ask_only":"可以问，不能改","bus_note":"只询问。卡车上的任何东西都不会被改动。PCAN-USB FD 不支持 CAN XL。","not_a_question":"这一帧不是只读询问。清除、复位、写入、刷写、安全访问和控制都不会发送。","plain_boundary":"这个工具只询问数据。它不会写入、刷写、解锁或控制车辆。","plain_nothing":"没有插上任何设备。把 USB-CAN 转接头插到这台电脑上。不用知道它是 Peak、ZLG 还是别的牌子。","plain_driver":"转接头的驱动没装上。装上转接头附带的驱动，然后再插一次。不用在 Peak 和 ZLG 之间做选择。","plain_bitrate":"转接头的波特率不对。诊断口需要经典 CAN，500 kbit/s。","plain_power":"车辆总线没有电，或者诊断线没插紧。打开点火，检查 OBD 的 6 脚和 14 脚。","plug_brand":"插上 USB-CAN 转接头。不用知道牌子。","help_plug":"插上 USB-CAN 转接头，然后：connect","help_brand":"不用知道它是 Peak、ZLG 还是别的牌子。","help_lang":"一次只用一种语言，来自 WR_LANG 或 --lang，和 windrose.ai 的语言列表相同。没填或不认识时用英语。","found":"找到了：%s。","asked":"已向 %s 询问会话、故障码和 VIN，地址 0x18DBFFF1。车辆上没有任何东西被改动。","heard":"听到了总线上的报文，并用公开词典做了解读。","quiet_bus":"没有报文回来。打开点火，把诊断线插紧。","uds_50":"诊断会话","uds_59":"故障信息","uds_62":"数据值","uds_7e":"测试仪仍在","uds_7f":"车辆拒绝了这个问题","uds_locked":"车辆要求安全解锁。这个工具不会解锁。","response":"响应 0x%X：%s。","response_unknown":"响应 0x%X：%d 字节，不在公开词典里。","plot_note":"插上 USB-CAN 转接头。不用知道牌子。CAN 适配器（Peak、ZLG，或其他）。本地文件，不会发给助手。只做只读询问，车辆不会被改动。","plot_empty":"这段记录里没有信号改变过数值。","plugged_in":"已插上：%s。","uds_bus":"UDS 询问只发在诊断 CAN 上（OBD 6/14 脚，经典 CAN 500 kbit/s，经 TGW / GWCANFD9，29 位功能寻址 0x18DBFFF1 或物理寻址 0x18DAxxF1）。"},"zh_tw":{"ask_only":"可以問，不能改","bus_note":"只詢問。卡車上的任何東西都不會被改動。PCAN-USB FD 不支援 CAN XL。","not_a_question":"這一幀不是唯讀詢問。清除、復位、寫入、刷寫、安全存取和控制都不會送出。","plain_boundary":"這個工具只詢問資料。它不會寫入、刷寫、解鎖或控制車輛。","plain_nothing":"沒有插上任何裝置。把 USB-CAN 轉接器插到這台電腦上。不用知道它是 Peak、ZLG 還是別的牌子。","plain_driver":"轉接器的驅動沒裝上。裝上轉接器附帶的驅動，然後再插一次。不用在 Peak 和 ZLG 之間做選擇。","plain_bitrate":"轉接器的位元速率不對。診斷口需要經典 CAN，500 kbit/s。","plain_power":"車輛匯流排沒有電，或者診斷線沒插緊。打開點火，檢查 OBD 的 6 腳和 14 腳。","plug_brand":"插上 USB-CAN 轉接器。不用知道牌子。","help_plug":"插上 USB-CAN 轉接器，然後：connect","help_brand":"不用知道它是 Peak、ZLG 還是別的牌子。","help_lang":"一次只用一種語言，來自 WR_LANG 或 --lang，和 windrose.ai 的語言清單相同。沒填或不認識時用英文。","found":"找到了：%s。","asked":"已向 %s 詢問會話、故障碼和 VIN，位址 0x18DBFFF1。車輛上沒有任何東西被改動。","heard":"聽到了匯流排上的訊息，並用公開詞典做了解讀。","quiet_bus":"沒有訊息回來。打開點火，把診斷線插緊。","uds_50":"診斷會話","uds_59":"故障資訊","uds_62":"資料值","uds_7e":"測試儀仍在","uds_7f":"車輛拒絕了這個問題","uds_locked":"車輛要求安全解鎖。這個工具不會解鎖。","response":"回應 0x%X：%s。","response_unknown":"回應 0x%X：%d 位元組，不在公開詞典裡。","plot_note":"插上 USB-CAN 轉接器。不用知道牌子。CAN 配接器（Peak、ZLG，或其他）。本機檔案，不會發給助手。只做唯讀詢問，車輛不會被改動。","plot_empty":"這段紀錄裡沒有信號改變過數值。","plugged_in":"已插上：%s。","uds_bus":"UDS 詢問只發在診斷 CAN 上（OBD 6/14 腳，經典 CAN 500 kbit/s，經 TGW / GWCANFD9，29 位元功能定址 0x18DBFFF1 或實體定址 0x18DAxxF1）。"},"fr":{"ask_only":"Vous pouvez interroger. Vous ne pouvez pas modifier.","bus_note":"Interrogation seulement. Rien n’est modifié sur le camion. CAN XL n’est pas disponible sur PCAN-USB FD.","not_a_question":"Cette trame n’est pas une question en lecture seule. Effacement, réinitialisation, écriture, flash, accès sécurité et commande ne sont pas envoyés.","plain_boundary":"Cet outil ne fait qu’interroger. Il n’écrit pas, ne flashe pas, ne déverrouille pas et ne commande pas le véhicule.","plain_nothing":"Rien n’est branché. Branchez un adaptateur USB-CAN sur cet ordinateur. Inutile de savoir si c’est un Peak, un ZLG ou une autre marque.","plain_driver":"Le pilote de l’adaptateur manque. Installez le pilote fourni avec l’adaptateur, puis rebranchez-le. Inutile de choisir entre Peak et ZLG.","plain_bitrate":"Le débit de l’adaptateur est incorrect. La prise diagnostic exige le CAN classique à 500 kbit/s.","plain_power":"Le bus du véhicule n’est pas alimenté, ou le câble diagnostic est mal enfoncé. Mettez le contact et vérifiez les broches OBD 6 et 14.","plug_brand":"Branchez un adaptateur USB-CAN. Inutile de connaître la marque.","help_plug":"Branchez un adaptateur USB-CAN, puis : connect","help_brand":"Inutile de savoir si c’est un Peak, un ZLG ou une autre marque.","help_lang":"Une langue à la fois, via WR_LANG ou --lang, la même liste que windrose.ai. Anglais si elle est vide ou inconnue.","found":"Trouvé : %s.","asked":"Questions envoyées à %s : session, codes défaut et VIN sur 0x18DBFFF1. Rien n’a été modifié sur le véhicule.","heard":"Du trafic a été entendu et décodé avec le dictionnaire public.","quiet_bus":"Aucun message n’est revenu. Mettez le contact et enfoncez le câble sur la prise diagnostic.","uds_50":"session diagnostic","uds_59":"informations de défaut","uds_62":"valeur de donnée","uds_7e":"testeur toujours présent","uds_7f":"le véhicule a refusé la question","uds_locked":"le véhicule a demandé un déverrouillage de sécurité. Cet outil ne le déverrouille pas.","response":"Réponse 0x%X : %s.","response_unknown":"Réponse 0x%X : %d octets, absents du dictionnaire public.","plot_note":"Branchez un adaptateur USB-CAN. Inutile de connaître la marque. Adaptateur CAN (Peak, ZLG, …). Fichier local. Il n’est pas envoyé à l’assistant. Questions en lecture seule seulement ; le véhicule n’est pas modifié.","plot_empty":"Aucun signal de cet enregistrement n’a changé de valeur.","plugged_in":"Branché : %s.","uds_bus":"Les questions UDS partent uniquement sur le CAN diagnostic (broches OBD 6/14, CAN classique 500 kbit/s via TGW / GWCANFD9, fonctionnel 29 bits 0x18DBFFF1 ou physique 0x18DAxxF1)."},"de":{"ask_only":"Sie können fragen. Sie können nichts ändern.","bus_note":"Nur fragen. Am Lkw wird nichts verändert. CAN XL ist auf PCAN-USB FD nicht verfügbar.","not_a_question":"Dieser Frame ist keine reine Leseanfrage. Löschen, Rücksetzen, Schreiben, Flashen, Security Access und Steuern werden nicht gesendet.","plain_boundary":"Dieses Werkzeug fragt nur Daten ab. Es schreibt nicht, flasht nicht, entsperrt nicht und steuert das Fahrzeug nicht.","plain_nothing":"Nichts ist eingesteckt. Stecken Sie einen USB-CAN-Adapter an diesen Computer. Sie müssen nicht wissen, ob es Peak, ZLG oder eine andere Marke ist.","plain_driver":"Der Adaptertreiber fehlt. Installieren Sie den Treiber aus dem Lieferumfang und stecken Sie den Adapter erneut ein. Sie müssen nicht zwischen Peak und ZLG wählen.","plain_bitrate":"Der Adapter hat die falsche Bitrate. Die Diagnosebuchse braucht klassisches CAN mit 500 kbit/s.","plain_power":"Der Fahrzeugbus hat keine Spannung, oder das Diagnosekabel sitzt nicht. Zündung ein und OBD-Pins 6 und 14 prüfen.","plug_brand":"Stecken Sie einen USB-CAN-Adapter ein. Die Marke müssen Sie nicht kennen.","help_plug":"USB-CAN-Adapter einstecken, dann: connect","help_brand":"Sie müssen nicht wissen, ob es Peak, ZLG oder eine andere Marke ist.","help_lang":"Eine Sprache zur Zeit, über WR_LANG oder --lang, dieselbe Liste wie windrose.ai. Englisch, wenn sie leer oder unbekannt ist.","found":"Gefunden: %s.","asked":"%s wurde nach Sitzung, Fehlercodes und VIN auf 0x18DBFFF1 gefragt. Am Fahrzeug wurde nichts verändert.","heard":"Verkehr wurde gehört und mit dem öffentlichen Wörterbuch dekodiert.","quiet_bus":"Es kam keine Antwort. Zündung einschalten und das Kabel an der Diagnosebuchse fest einstecken.","uds_50":"Diagnosesitzung","uds_59":"Fehlerinformation","uds_62":"Datenwert","uds_7e":"Tester noch anwesend","uds_7f":"das Fahrzeug hat die Frage abgelehnt","uds_locked":"das Fahrzeug hat eine Sicherheitsfreigabe verlangt. Dieses Werkzeug entsperrt nicht.","response":"Antwort 0x%X: %s.","response_unknown":"Antwort 0x%X: %d Bytes, nicht im öffentlichen Wörterbuch.","plot_note":"Stecken Sie einen USB-CAN-Adapter ein. Die Marke müssen Sie nicht kennen. CAN-Adapter (Peak, ZLG, …). Lokale Datei. Sie wird nicht an den Assistenten gesendet. Nur Lesefragen; das Fahrzeug wird nicht verändert.","plot_empty":"Kein Signal in dieser Aufzeichnung hat den Wert geändert.","plugged_in":"Eingesteckt: %s.","uds_bus":"UDS-Fragen gehen nur auf den Diagnose-CAN (OBD-Pins 6/14, klassisches CAN 500 kbit/s über TGW / GWCANFD9, 29-Bit funktionell 0x18DBFFF1 oder physisch 0x18DAxxF1)."},"es":{"ask_only":"Puede preguntar. No puede cambiar nada.","bus_note":"Solo preguntas. No se cambia nada en el camión. CAN XL no está disponible en PCAN-USB FD.","not_a_question":"Esta trama no es una pregunta de solo lectura. No se envían borrado, reinicio, escritura, flash, acceso de seguridad ni control.","plain_boundary":"Esta herramienta solo pide datos. No escribe, no flashea, no desbloquea ni manda el vehículo.","plain_nothing":"No hay nada conectado. Enchufe un adaptador USB-CAN en este ordenador. No hace falta saber si es Peak, ZLG u otra marca.","plain_driver":"Falta el controlador del adaptador. Instale el que venía con el adaptador y vuelva a enchufarlo. No hace falta elegir entre Peak y ZLG.","plain_bitrate":"El adaptador está a la velocidad incorrecta. El conector de diagnóstico necesita CAN clásico a 500 kbit/s.","plain_power":"El bus del vehículo no tiene alimentación, o el cable de diagnóstico no está bien puesto. Dé el contacto y revise las patillas OBD 6 y 14.","plug_brand":"Enchufe un adaptador USB-CAN. No hace falta conocer la marca.","help_plug":"Enchufe un adaptador USB-CAN y luego: connect","help_brand":"No hace falta saber si es Peak, ZLG u otra marca.","help_lang":"Un idioma cada vez, con WR_LANG o --lang, la misma lista que windrose.ai. Inglés si está vacío o no se reconoce.","found":"Encontrado: %s.","asked":"Se preguntó a %s por la sesión, los códigos de fallo y el VIN en 0x18DBFFF1. No se cambió nada en el vehículo.","heard":"Se oyó tráfico y se decodificó con el diccionario público.","quiet_bus":"No volvió ningún mensaje. Dé el contacto y asiente el cable en el conector de diagnóstico.","uds_50":"sesión de diagnóstico","uds_59":"información de fallos","uds_62":"valor de dato","uds_7e":"el tester sigue presente","uds_7f":"el vehículo rechazó la pregunta","uds_locked":"el vehículo pidió un desbloqueo de seguridad. Esta herramienta no lo desbloquea.","response":"Respuesta 0x%X: %s.","response_unknown":"Respuesta 0x%X: %d bytes, no están en el diccionario público.","plot_note":"Enchufe un adaptador USB-CAN. No hace falta conocer la marca. Adaptador CAN (Peak, ZLG, …). Archivo local. No se envía al asistente. Solo preguntas de lectura; el vehículo no se cambia.","plot_empty":"Ninguna señal de esta grabación cambió de valor.","plugged_in":"Conectado: %s.","uds_bus":"Las preguntas UDS salen solo por el CAN de diagnóstico (patillas OBD 6/14, CAN clásico a 500 kbit/s vía TGW / GWCANFD9, funcional de 29 bits 0x18DBFFF1 o físico 0x18DAxxF1)."},"it":{"ask_only":"Puoi chiedere. Non puoi modificare.","bus_note":"Solo domande. Sul camion non viene cambiato nulla. CAN XL non è disponibile su PCAN-USB FD.","not_a_question":"Questo frame non è una domanda in sola lettura. Cancellazione, reset, scrittura, flash, accesso di sicurezza e controllo non vengono inviati.","plain_boundary":"Questo strumento chiede solo dati. Non scrive, non flasha, non sblocca e non comanda il veicolo.","plain_nothing":"Non c’è niente collegato. Collega un adattatore USB-CAN a questo computer. Non serve sapere se è Peak, ZLG o un’altra marca.","plain_driver":"Manca il driver dell’adattatore. Installa il driver fornito con l’adattatore, poi ricollegalo. Non serve scegliere tra Peak e ZLG.","plain_bitrate":"L’adattatore è alla velocità sbagliata. La presa diagnostica richiede CAN classico a 500 kbit/s.","plain_power":"Il bus del veicolo non è alimentato, oppure il cavo diagnostico non è inserito bene. Accendi il quadro e controlla i pin OBD 6 e 14.","plug_brand":"Collega un adattatore USB-CAN. Non serve conoscere la marca.","help_plug":"Collega un adattatore USB-CAN, poi: connect","help_brand":"Non serve sapere se è Peak, ZLG o un’altra marca.","help_lang":"Una lingua alla volta, da WR_LANG o --lang, lo stesso elenco di windrose.ai. Inglese se è vuota o sconosciuta.","found":"Trovato: %s.","asked":"Richieste a %s: sessione, codici guasto e VIN su 0x18DBFFF1. Sul veicolo non è stato cambiato nulla.","heard":"È stato sentito traffico e decodificato con il dizionario pubblico.","quiet_bus":"Non è tornato nessun messaggio. Accendi il quadro e infila bene il cavo nella presa diagnostica.","uds_50":"sessione diagnostica","uds_59":"informazioni di guasto","uds_62":"valore dato","uds_7e":"tester ancora presente","uds_7f":"il veicolo ha rifiutato la domanda","uds_locked":"il veicolo ha chiesto uno sblocco di sicurezza. Questo strumento non sblocca.","response":"Risposta 0x%X: %s.","response_unknown":"Risposta 0x%X: %d byte, non nel dizionario pubblico.","plot_note":"Collega un adattatore USB-CAN. Non serve conoscere la marca. Adattatore CAN (Peak, ZLG, …). File locale. Non viene inviato all’assistente. Solo domande in lettura; il veicolo non viene modificato.","plot_empty":"Nessun segnale di questa registrazione ha cambiato valore.","plugged_in":"Collegato: %s.","uds_bus":"Le domande UDS escono solo sul CAN diagnostico (pin OBD 6/14, CAN classico 500 kbit/s tramite TGW / GWCANFD9, funzionale a 29 bit 0x18DBFFF1 o fisico 0x18DAxxF1)."},"pt":{"ask_only":"Pode perguntar. Não pode alterar.","bus_note":"Apenas perguntas. Nada no camião é alterado. CAN XL não está disponível no PCAN-USB FD.","not_a_question":"Esta trama não é uma pergunta só de leitura. Apagar, repor, escrever, flash, acesso de segurança e controlo não são enviados.","plain_boundary":"Esta ferramenta só pede dados. Não escreve, não faz flash, não destranca nem comanda o veículo.","plain_nothing":"Nada está ligado. Ligue um adaptador USB-CAN a este computador. Não precisa de saber se é Peak, ZLG ou outra marca.","plain_driver":"Falta o controlador do adaptador. Instale o controlador que veio com o adaptador e volte a ligá-lo. Não precisa de escolher entre Peak e ZLG.","plain_bitrate":"O adaptador está na velocidade errada. A ficha de diagnóstico precisa de CAN clássico a 500 kbit/s.","plain_power":"O barramento do veículo não tem alimentação, ou o cabo de diagnóstico não está bem encaixado. Ligue a ignição e verifique os pinos OBD 6 e 14.","plug_brand":"Ligue um adaptador USB-CAN. Não precisa de saber a marca.","help_plug":"Ligue um adaptador USB-CAN e depois: connect","help_brand":"Não precisa de saber se é Peak, ZLG ou outra marca.","help_lang":"Uma língua de cada vez, por WR_LANG ou --lang, a mesma lista do windrose.ai. Inglês se estiver vazio ou for desconhecido.","found":"Encontrado: %s.","asked":"Perguntas a %s: sessão, códigos de avaria e VIN em 0x18DBFFF1. Nada foi alterado no veículo.","heard":"Houve tráfego e foi descodificado com o dicionário público.","quiet_bus":"Não voltou nenhuma mensagem. Ligue a ignição e encaixe o cabo na ficha de diagnóstico.","uds_50":"sessão de diagnóstico","uds_59":"informação de avarias","uds_62":"valor de dados","uds_7e":"o tester continua presente","uds_7f":"o veículo recusou a pergunta","uds_locked":"o veículo pediu um desbloqueio de segurança. Esta ferramenta não desbloqueia.","response":"Resposta 0x%X: %s.","response_unknown":"Resposta 0x%X: %d bytes, fora do dicionário público.","plot_note":"Ligue um adaptador USB-CAN. Não precisa de saber a marca. Adaptador CAN (Peak, ZLG, …). Ficheiro local. Não é enviado ao assistente. Só perguntas de leitura; o veículo não é alterado.","plot_empty":"Nenhum sinal desta gravação mudou de valor.","plugged_in":"Ligado: %s.","uds_bus":"As perguntas UDS saem só no CAN de diagnóstico (pinos OBD 6/14, CAN clássico a 500 kbit/s via TGW / GWCANFD9, funcional de 29 bits 0x18DBFFF1 ou físico 0x18DAxxF1)."},"nl":{"ask_only":"U kunt vragen. U kunt niets wijzigen.","bus_note":"Alleen vragen. Er wordt niets aan de truck veranderd. CAN XL is niet beschikbaar op PCAN-USB FD.","not_a_question":"Dit frame is geen alleen-lezen vraag. Wissen, resetten, schrijven, flashen, security access en aansturen worden niet verzonden.","plain_boundary":"Dit programma vraagt alleen gegevens. Het schrijft niet, flasht niet, ontgrendelt niet en stuurt het voertuig niet aan.","plain_nothing":"Er is niets ingestoken. Steek een USB-CAN-adapter in deze computer. U hoeft niet te weten of het Peak, ZLG of een ander merk is.","plain_driver":"Het adapterstuurprogramma ontbreekt. Installeer het stuurprogramma dat bij de adapter hoort en steek hem opnieuw in. U hoeft niet tussen Peak en ZLG te kiezen.","plain_bitrate":"De adapter staat op de verkeerde bitrate. De diagnosestekker heeft klassiek CAN op 500 kbit/s nodig.","plain_power":"De voertuigbus heeft geen spanning, of de diagnoselkabel zit niet goed. Zet het contact aan en controleer OBD-pinnen 6 en 14.","plug_brand":"Steek een USB-CAN-adapter in. U hoeft het merk niet te kennen.","help_plug":"Steek een USB-CAN-adapter in, en dan: connect","help_brand":"U hoeft niet te weten of het Peak, ZLG of een ander merk is.","help_lang":"Eén taal tegelijk, via WR_LANG of --lang, dezelfde lijst als windrose.ai. Engels als die leeg of onbekend is.","found":"Gevonden: %s.","asked":"%s is gevraagd om sessie, foutcodes en VIN op 0x18DBFFF1. Er is niets aan het voertuig veranderd.","heard":"Er was verkeer en het is gedecodeerd met het openbare woordenboek.","quiet_bus":"Er kwam geen bericht terug. Zet het contact aan en duw de kabel goed in de diagnosestekker.","uds_50":"diagnosesessie","uds_59":"foutinformatie","uds_62":"gegevenswaarde","uds_7e":"tester nog aanwezig","uds_7f":"het voertuig wees de vraag af","uds_locked":"het voertuig vroeg om een beveiligingsontgrendeling. Dit programma ontgrendelt niet.","response":"Antwoord 0x%X: %s.","response_unknown":"Antwoord 0x%X: %d bytes, niet in het openbare woordenboek.","plot_note":"Steek een USB-CAN-adapter in. U hoeft het merk niet te kennen. CAN-adapter (Peak, ZLG, …). Lokaal bestand. Het gaat niet naar de assistent. Alleen leesvragen; het voertuig wordt niet veranderd.","plot_empty":"Geen signaal in deze opname veranderde van waarde.","plugged_in":"Ingestoken: %s.","uds_bus":"UDS-vragen gaan alleen op de diagnose-CAN (OBD-pinnen 6/14, klassiek CAN 500 kbit/s via TGW / GWCANFD9, 29-bit functioneel 0x18DBFFF1 of fysiek 0x18DAxxF1)."},"pl":{"ask_only":"Możesz pytać. Nie możesz nic zmieniać.","bus_note":"Tylko pytania. Na ciężarówce nic nie jest zmieniane. CAN XL nie jest dostępny na PCAN-USB FD.","not_a_question":"Ta ramka nie jest pytaniem tylko do odczytu. Kasowanie, reset, zapis, flash, dostęp bezpieczeństwa i sterowanie nie są wysyłane.","plain_boundary":"To narzędzie tylko pyta o dane. Nie zapisuje, nie flashuje, nie odblokowuje i nie steruje pojazdem.","plain_nothing":"Nic nie jest podłączone. Podłącz adapter USB-CAN do tego komputera. Nie musisz wiedzieć, czy to Peak, ZLG czy inna marka.","plain_driver":"Brakuje sterownika adaptera. Zainstaluj sterownik dołączony do adaptera i podłącz go ponownie. Nie musisz wybierać między Peak a ZLG.","plain_bitrate":"Adapter ma złą prędkość. Wtyczka diagnostyczna wymaga klasycznego CAN 500 kbit/s.","plain_power":"Magistrala pojazdu nie ma zasilania albo kabel diagnostyczny nie jest dociśnięty. Włącz zapłon i sprawdź piny OBD 6 i 14.","plug_brand":"Podłącz adapter USB-CAN. Nie musisz znać marki.","help_plug":"Podłącz adapter USB-CAN, potem: connect","help_brand":"Nie musisz wiedzieć, czy to Peak, ZLG czy inna marka.","help_lang":"Jeden język naraz, z WR_LANG albo --lang, ta sama lista co windrose.ai. Angielski, gdy jest puste albo nieznane.","found":"Znaleziono: %s.","asked":"Zapytano %s o sesję, kody usterek i VIN na 0x18DBFFF1. W pojeździe nic nie zostało zmienione.","heard":"Usłyszano ruch i odczytano go publicznym słownikiem.","quiet_bus":"Nie wróciła żadna wiadomość. Włącz zapłon i dociśnij kabel we wtyczce diagnostycznej.","uds_50":"sesja diagnostyczna","uds_59":"informacja o usterkach","uds_62":"wartość danych","uds_7e":"tester nadal obecny","uds_7f":"pojazd odrzucił pytanie","uds_locked":"pojazd poprosił o odblokowanie bezpieczeństwa. To narzędzie nie odblokowuje.","response":"Odpowiedź 0x%X: %s.","response_unknown":"Odpowiedź 0x%X: %d bajtów, nie ma ich w publicznym słowniku.","plot_note":"Podłącz adapter USB-CAN. Nie musisz znać marki. Adapter CAN (Peak, ZLG, …). Plik lokalny. Nie jest wysyłany do asystenta. Tylko pytania do odczytu; pojazd nie jest zmieniany.","plot_empty":"Żaden sygnał w tym nagraniu nie zmienił wartości.","plugged_in":"Podłączono: %s.","uds_bus":"Pytania UDS wychodzą tylko na diagnostycznym CAN (piny OBD 6/14, klasyczny CAN 500 kbit/s przez TGW / GWCANFD9, funkcjonalny 29-bit 0x18DBFFF1 lub fizyczny 0x18DAxxF1)."},"sv":{"ask_only":"Du kan fråga. Du kan inte ändra.","bus_note":"Bara frågor. Ingenting på lastbilen ändras. CAN XL finns inte på PCAN-USB FD.","not_a_question":"Den här ramen är inte en skrivskyddad fråga. Radering, återställning, skrivning, flash, säkerhetsåtkomst och styrning skickas inte.","plain_boundary":"Det här verktyget frågar bara efter data. Det skriver inte, flashar inte, låser inte upp och styr inte fordonet.","plain_nothing":"Ingenting är inkopplat. Sätt i en USB-CAN-adapter i den här datorn. Du behöver inte veta om det är Peak, ZLG eller ett annat märke.","plain_driver":"Adapterdrivrutinen saknas. Installera drivrutinen som följde med adaptern och sätt i den igen. Du behöver inte välja mellan Peak och ZLG.","plain_bitrate":"Adaptern har fel bithastighet. Diagnoskontakten behöver klassisk CAN på 500 kbit/s.","plain_power":"Fordonsbussen har ingen spänning, eller så sitter diagnoskabeln inte i. Slå på tändningen och kontrollera OBD-stift 6 och 14.","plug_brand":"Sätt i en USB-CAN-adapter. Du behöver inte känna till märket.","help_plug":"Sätt i en USB-CAN-adapter, sedan: connect","help_brand":"Du behöver inte veta om det är Peak, ZLG eller ett annat märke.","help_lang":"Ett språk i taget, från WR_LANG eller --lang, samma lista som windrose.ai. Engelska om det är tomt eller okänt.","found":"Hittade: %s.","asked":"Frågade %s om session, felkoder och VIN på 0x18DBFFF1. Ingenting på fordonet ändrades.","heard":"Trafik hördes och avkodades med den offentliga ordlistan.","quiet_bus":"Inget meddelande kom tillbaka. Slå på tändningen och tryck in kabeln i diagnoskontakten.","uds_50":"diagnossession","uds_59":"felinformation","uds_62":"datavärde","uds_7e":"testaren är kvar","uds_7f":"fordonet avböjde frågan","uds_locked":"fordonet bad om en säkerhetsupplåsning. Det här verktyget låser inte upp.","response":"Svar 0x%X: %s.","response_unknown":"Svar 0x%X: %d byte, finns inte i den offentliga ordlistan.","plot_note":"Sätt i en USB-CAN-adapter. Du behöver inte känna till märket. CAN-adapter (Peak, ZLG, …). Lokal fil. Den skickas inte till assistenten. Bara läsfrågor; fordonet ändras inte.","plot_empty":"Ingen signal i den här inspelningen ändrade värde.","plugged_in":"Inkopplad: %s.","uds_bus":"UDS-frågor går bara ut på diagnos-CAN (OBD-stift 6/14, klassisk CAN 500 kbit/s via TGW / GWCANFD9, 29-bitars funktionell 0x18DBFFF1 eller fysisk 0x18DAxxF1)."},"da":{"ask_only":"Du kan spørge. Du kan ikke ændre.","bus_note":"Kun spørgsmål. Intet på lastbilen ændres. CAN XL findes ikke på PCAN-USB FD.","not_a_question":"Denne ramme er ikke et skrivebeskyttet spørgsmål. Rydning, nulstilling, skrivning, flash, sikkerhedsadgang og styring sendes ikke.","plain_boundary":"Dette værktøj spørger kun om data. Det skriver ikke, flasher ikke, låser ikke op og styrer ikke køretøjet.","plain_nothing":"Der er ikke sat noget i. Sæt en USB-CAN-adapter i denne computer. Du behøver ikke vide, om det er Peak, ZLG eller et andet mærke.","plain_driver":"Adapterdriveren mangler. Installer driveren, der fulgte med adapteren, og sæt den i igen. Du behøver ikke vælge mellem Peak og ZLG.","plain_bitrate":"Adapteren har den forkerte bitrate. Diagnosestikket skal bruge klassisk CAN ved 500 kbit/s.","plain_power":"Køretøjets bus har ingen spænding, eller diagnosekablet sidder ikke fast. Tænd tændingen og tjek OBD-ben 6 og 14.","plug_brand":"Sæt en USB-CAN-adapter i. Du behøver ikke kende mærket.","help_plug":"Sæt en USB-CAN-adapter i, og så: connect","help_brand":"Du behøver ikke vide, om det er Peak, ZLG eller et andet mærke.","help_lang":"Et sprog ad gangen, fra WR_LANG eller --lang, samme liste som windrose.ai. Engelsk hvis det er tomt eller ukendt.","found":"Fundet: %s.","asked":"Spurgte %s om session, fejlkoder og VIN på 0x18DBFFF1. Intet på køretøjet blev ændret.","heard":"Der var trafik, og den blev afkodet med den offentlige ordbog.","quiet_bus":"Der kom ingen besked tilbage. Tænd tændingen og skub kablet i diagnosestikket.","uds_50":"diagnosesession","uds_59":"fejlinformation","uds_62":"dataværdi","uds_7e":"testeren er der stadig","uds_7f":"køretøjet afviste spørgsmålet","uds_locked":"køretøjet bad om en sikkerhedsoplåsning. Dette værktøj låser ikke op.","response":"Svar 0x%X: %s.","response_unknown":"Svar 0x%X: %d byte, ikke i den offentlige ordbog.","plot_note":"Sæt en USB-CAN-adapter i. Du behøver ikke kende mærket. CAN-adapter (Peak, ZLG, …). Lokal fil. Den sendes ikke til assistenten. Kun læsespørgsmål; køretøjet ændres ikke.","plot_empty":"Intet signal i denne optagelse skiftede værdi.","plugged_in":"Sat i: %s.","uds_bus":"UDS-spørgsmål sendes kun på diagnose-CAN (OBD-ben 6/14, klassisk CAN 500 kbit/s via TGW / GWCANFD9, 29-bit funktionel 0x18DBFFF1 eller fysisk 0x18DAxxF1)."},"no":{"ask_only":"Du kan spørre. Du kan ikke endre.","bus_note":"Bare spørsmål. Ingenting på lastebilen endres. CAN XL er ikke tilgjengelig på PCAN-USB FD.","not_a_question":"Denne rammen er ikke et skrivebeskyttet spørsmål. Sletting, tilbakestilling, skriving, flashing, sikkerhetstilgang og styring sendes ikke.","plain_boundary":"Dette verktøyet spør bare om data. Det skriver ikke, flasher ikke, låser ikke opp og styrer ikke kjøretøyet.","plain_nothing":"Ingenting er plugget inn. Sett en USB-CAN-adapter i denne datamaskinen. Du trenger ikke vite om det er Peak, ZLG eller et annet merke.","plain_driver":"Adapterdriveren mangler. Installer driveren som fulgte med adapteren, og sett den inn igjen. Du trenger ikke velge mellom Peak og ZLG.","plain_bitrate":"Adapteren har feil bitrate. Diagnosepluggen trenger klassisk CAN på 500 kbit/s.","plain_power":"Kjøretøybussen har ingen spenning, eller diagnosekabelen sitter ikke. Slå på tenningen og sjekk OBD-pinne 6 og 14.","plug_brand":"Sett inn en USB-CAN-adapter. Du trenger ikke kjenne merket.","help_plug":"Sett inn en USB-CAN-adapter, deretter: connect","help_brand":"Du trenger ikke vite om det er Peak, ZLG eller et annet merke.","help_lang":"Ett språk om gangen, fra WR_LANG eller --lang, samme liste som windrose.ai. Engelsk hvis den er tom eller ukjent.","found":"Funnet: %s.","asked":"Spurte %s om økt, feilkoder og VIN på 0x18DBFFF1. Ingenting på kjøretøyet ble endret.","heard":"Trafikk ble hørt og dekodet med den offentlige ordlisten.","quiet_bus":"Ingen melding kom tilbake. Slå på tenningen og skyv kabelen inn i diagnosepluggen.","uds_50":"diagnoseøkt","uds_59":"feilinformasjon","uds_62":"dataverdi","uds_7e":"testeren er fortsatt til stede","uds_7f":"kjøretøyet avslo spørsmålet","uds_locked":"kjøretøyet ba om en sikkerhetsopplåsing. Dette verktøyet låser ikke opp.","response":"Svar 0x%X: %s.","response_unknown":"Svar 0x%X: %d byte, ikke i den offentlige ordlisten.","plot_note":"Sett inn en USB-CAN-adapter. Du trenger ikke kjenne merket. CAN-adapter (Peak, ZLG, …). Lokal fil. Den sendes ikke til assistenten. Bare lesespørsmål; kjøretøyet endres ikke.","plot_empty":"Ingen signaler i dette opptaket endret verdi.","plugged_in":"Plugget inn: %s.","uds_bus":"UDS-spørsmål går bare ut på diagnose-CAN (OBD-pinne 6/14, klassisk CAN 500 kbit/s via TGW / GWCANFD9, 29-bit funksjonell 0x18DBFFF1 eller fysisk 0x18DAxxF1)."},"fi":{"ask_only":"Voit kysyä. Et voi muuttaa.","bus_note":"Vain kysymyksiä. Kuorma-autossa ei muuteta mitään. CAN XL ei ole käytettävissä PCAN-USB FD:ssä.","not_a_question":"Tämä kehys ei ole vain luku -kysymys. Tyhjennystä, nollausta, kirjoitusta, flashausta, turvakäyttöä ja ohjausta ei lähetetä.","plain_boundary":"Tämä työkalu vain kysyy tietoja. Se ei kirjoita, flashaa, avaa lukitusta eikä ohjaa ajoneuvoa.","plain_nothing":"Mitään ei ole kytketty. Kytke USB-CAN-sovitin tähän tietokoneeseen. Sinun ei tarvitse tietää, onko se Peak, ZLG vai jokin muu merkki.","plain_driver":"Sovittimen ajuri puuttuu. Asenna sovittimen mukana tullut ajuri ja kytke se uudelleen. Sinun ei tarvitse valita Peakin ja ZLG:n välillä.","plain_bitrate":"Sovittimen bittinopeus on väärä. Diagnostiikkaliitin tarvitsee klassisen CANin, 500 kbit/s.","plain_power":"Ajoneuvon väylässä ei ole virtaa, tai diagnostiikkakaapeli ei ole pohjassa. Kytke virta ja tarkista OBD-nastat 6 ja 14.","plug_brand":"Kytke USB-CAN-sovitin. Merkkiä ei tarvitse tietää.","help_plug":"Kytke USB-CAN-sovitin ja sitten: connect","help_brand":"Sinun ei tarvitse tietää, onko se Peak, ZLG vai jokin muu merkki.","help_lang":"Yksi kieli kerrallaan, WR_LANG tai --lang, sama lista kuin windrose.ai. Englanti, jos arvo on tyhjä tai tuntematon.","found":"Löytyi: %s.","asked":"Kysyttiin laitteelta %s istunto, vikakoodit ja VIN osoitteessa 0x18DBFFF1. Ajoneuvossa ei muutettu mitään.","heard":"Liikennettä kuultiin ja se purettiin julkisella sanastolla.","quiet_bus":"Viestejä ei tullut takaisin. Kytke virta ja paina kaapeli diagnostiikkaliittimeen.","uds_50":"diagnostiikkaistunto","uds_59":"vikatieto","uds_62":"tietoarvo","uds_7e":"testeri on yhä läsnä","uds_7f":"ajoneuvo hylkäsi kysymyksen","uds_locked":"ajoneuvo pyysi turva-avausta. Tämä työkalu ei avaa lukitusta.","response":"Vastaus 0x%X: %s.","response_unknown":"Vastaus 0x%X: %d tavua, ei julkisessa sanastossa.","plot_note":"Kytke USB-CAN-sovitin. Merkkiä ei tarvitse tietää. CAN-sovitin (Peak, ZLG, …). Paikallinen tiedosto. Sitä ei lähetetä avustajalle. Vain lukukysymyksiä; ajoneuvoa ei muuteta.","plot_empty":"Yksikään signaali tässä tallenteessa ei muuttanut arvoaan.","plugged_in":"Kytketty: %s.","uds_bus":"UDS-kysymykset lähtevät vain diagnostiikka-CANiin (OBD-nastat 6/14, klassinen CAN 500 kbit/s, TGW / GWCANFD9, 29-bittinen toiminnallinen 0x18DBFFF1 tai fyysinen 0x18DAxxF1)."},"is":{"ask_only":"Þú getur spurt. Þú getur ekki breytt.","bus_note":"Aðeins spurningar. Ekkert er breytt á flutningabílnum. CAN XL er ekki til á PCAN-USB FD.","not_a_question":"Þessi rammi er ekki lestrarfyrirspurn. Hreinsun, endurstilling, skrif, flass, öryggisaðgangur og stýring eru ekki send.","plain_boundary":"Þetta verkfæri spyr aðeins um gögn. Það skrifar ekki, flassar ekki, opnar ekki lás og stýrir ekki ökutækinu.","plain_nothing":"Ekkert er í sambandi. Tengdu USB-CAN-millistykki við þessa tölvu. Þú þarft ekki að vita hvort það er Peak, ZLG eða annað merki.","plain_driver":"Rekill millistykkisins vantar. Settu upp rekilinn sem fylgdi því og tengdu aftur. Þú þarft ekki að velja á milli Peak og ZLG.","plain_bitrate":"Millistykkið er á röngum bitahraða. Greiningartengið þarf hefðbundið CAN á 500 kbit/s.","plain_power":"Rúta ökutækisins er spennulaus, eða greiningarsnúran situr ekki. Kveiktu á og athugaðu OBD-pinna 6 og 14.","plug_brand":"Tengdu USB-CAN-millistykki. Þú þarft ekki að þekkja merkið.","help_plug":"Tengdu USB-CAN-millistykki, svo: connect","help_brand":"Þú þarft ekki að vita hvort það er Peak, ZLG eða annað merki.","help_lang":"Eitt tungumál í einu, úr WR_LANG eða --lang, sami listi og á windrose.ai. Enska ef tómt eða óþekkt.","found":"Fannst: %s.","asked":"Spurt var %s um lotu, bilanakóða og VIN á 0x18DBFFF1. Ekkert var breytt á ökutækinu.","heard":"Umferð heyrðist og var afkóðuð með opinbera orðasafninu.","quiet_bus":"Ekkert svar barst. Kveiktu á og stingdu snúrunni í greiningartengið.","uds_50":"greiningarlota","uds_59":"bilanaupplýsingar","uds_62":"gagnagildi","uds_7e":"prófari enn viðstaddur","uds_7f":"ökutækið hafnaði spurningunni","uds_locked":"ökutækið bað um öryggisopnun. Þetta verkfæri opnar ekki.","response":"Svar 0x%X: %s.","response_unknown":"Svar 0x%X: %d bæti, ekki í opinbera orðasafninu.","plot_note":"Tengdu USB-CAN-millistykki. Þú þarft ekki að þekkja merkið. CAN-millistykki (Peak, ZLG, …). Staðbundin skrá. Hún er ekki send aðstoðarmanninum. Aðeins lestrarfyrirspurnir; ökutækinu er ekki breytt.","plot_empty":"Ekkert merki í þessari upptöku breytti gildi.","plugged_in":"Tengt: %s.","uds_bus":"UDS-spurningar fara aðeins á greiningar-CAN (OBD-pinnar 6/14, hefðbundið CAN 500 kbit/s um TGW / GWCANFD9, 29 bita virkt 0x18DBFFF1 eða efnislegt 0x18DAxxF1)."},"tr":{"ask_only":"Sorabilirsiniz. Değiştiremezsiniz.","bus_note":"Yalnızca soru. Kamyonda hiçbir şey değiştirilmez. CAN XL, PCAN-USB FD üzerinde yoktur.","not_a_question":"Bu çerçeve salt okunur bir soru değil. Silme, sıfırlama, yazma, flaş, güvenlik erişimi ve kumanda gönderilmez.","plain_boundary":"Bu araç yalnızca veri sorar. Yazmaz, flaşlamaz, kilit açmaz ve aracı kumanda etmez.","plain_nothing":"Hiçbir şey takılı değil. Bu bilgisayara bir USB-CAN adaptörü takın. Peak mi, ZLG mi, başka bir marka mı bilmeniz gerekmez.","plain_driver":"Adaptör sürücüsü yok. Adaptörle gelen sürücüyü kurun, sonra yeniden takın. Peak ile ZLG arasında seçim yapmanız gerekmez.","plain_bitrate":"Adaptör yanlış bit hızında. Tanı fişi klasik CAN ve 500 kbit/s ister.","plain_power":"Araç veriyolunda güç yok ya da tanı kablosu oturmamış. Kontağı açın ve OBD pin 6 ile 14’ü kontrol edin.","plug_brand":"Bir USB-CAN adaptörü takın. Markayı bilmeniz gerekmez.","help_plug":"Bir USB-CAN adaptörü takın, sonra: connect","help_brand":"Peak mi, ZLG mi, başka bir marka mı bilmeniz gerekmez.","help_lang":"Aynı anda tek dil, WR_LANG veya --lang ile, windrose.ai ile aynı liste. Boş ya da bilinmiyorsa İngilizce.","found":"Bulundu: %s.","asked":"%s cihazına 0x18DBFFF1 üzerinde oturum, arıza kodları ve VIN soruldu. Araçta hiçbir şey değiştirilmedi.","heard":"Trafik duyuldu ve genel sözlükle çözüldü.","quiet_bus":"Hiç mesaj dönmedi. Kontağı açın ve kabloyu tanı fişine oturtun.","uds_50":"tanı oturumu","uds_59":"arıza bilgisi","uds_62":"veri değeri","uds_7e":"test cihazı hâlâ burada","uds_7f":"araç soruyu reddetti","uds_locked":"araç bir güvenlik kilidi açılması istedi. Bu araç kilidi açmaz.","response":"Yanıt 0x%X: %s.","response_unknown":"Yanıt 0x%X: %d bayt, genel sözlükte yok.","plot_note":"Bir USB-CAN adaptörü takın. Markayı bilmeniz gerekmez. CAN adaptörü (Peak, ZLG, …). Yerel dosya. Asistana gönderilmez. Yalnızca okuma soruları; araç değiştirilmez.","plot_empty":"Bu kayıtta hiçbir sinyal değer değiştirmedi.","plugged_in":"Takılı: %s.","uds_bus":"UDS soruları yalnızca tanı CAN’ına gider (OBD pin 6/14, TGW / GWCANFD9 üzerinden klasik CAN 500 kbit/s, 29 bit işlevsel 0x18DBFFF1 veya fiziksel 0x18DAxxF1)."},"ar":{"ask_only":"يمكنك أن تسأل. لا يمكنك أن تغيّر.","bus_note":"أسئلة فقط. لا يتغيّر شيء في الشاحنة. CAN XL غير متاح على PCAN-USB FD.","not_a_question":"هذا الإطار ليس سؤال قراءة فقط. المسح وإعادة الضبط والكتابة والبرمجة ودخول الأمان والتحكم لا تُرسَل.","plain_boundary":"هذه الأداة تسأل عن البيانات فقط. لا تكتب ولا تبرمج ولا تفك القفل ولا تقود المركبة.","plain_nothing":"لا شيء موصول. صِل محوّل USB-CAN بهذا الحاسوب. لا تحتاج أن تعرف إن كان Peak أو ZLG أو علامة أخرى.","plain_driver":"تعريف المحوّل غير موجود. ثبّت التعريف الذي جاء مع المحوّل ثم صِله مرة أخرى. لا تحتاج أن تختار بين Peak وZLG.","plain_bitrate":"سرعة المحوّل خاطئة. قابس التشخيص يحتاج CAN الكلاسيكي بسرعة 500 kbit/s.","plain_power":"ناقل المركبة بلا تغذية، أو كبل التشخيص غير مُحكم. شغّل الإشعال وتحقق من سنّي OBD 6 و14.","plug_brand":"صِل محوّل USB-CAN. لا تحتاج أن تعرف العلامة.","help_plug":"صِل محوّل USB-CAN ثم: connect","help_brand":"لا تحتاج أن تعرف إن كان Peak أو ZLG أو علامة أخرى.","help_lang":"لغة واحدة في كل مرة، من WR_LANG أو --lang، وهي قائمة windrose.ai نفسها. الإنجليزية إذا كانت فارغة أو غير معروفة.","found":"تم العثور على: %s.","asked":"سُئل %s عن الجلسة وأكواد الأعطال وVIN على 0x18DBFFF1. لم يتغيّر شيء في المركبة.","heard":"سُمع مرور على الناقل وفُكّ بالقاموس العام.","quiet_bus":"لم تَعد أي رسالة. شغّل الإشعال وأحكم الكبل في قابس التشخيص.","uds_50":"جلسة تشخيص","uds_59":"معلومات الأعطال","uds_62":"قيمة بيانات","uds_7e":"جهاز الفحص ما زال حاضرًا","uds_7f":"رفضت المركبة السؤال","uds_locked":"طلبت المركبة فتح أمان. هذه الأداة لا تفك القفل.","response":"استجابة 0x%X: %s.","response_unknown":"استجابة 0x%X: %d بايت، ليست في القاموس العام.","plot_note":"صِل محوّل USB-CAN. لا تحتاج أن تعرف العلامة. محوّل CAN ‏(Peak، ‏ZLG، …). ملف محلي. لا يُرسَل إلى المساعد. أسئلة قراءة فقط؛ المركبة لا تتغيّر.","plot_empty":"لم تغيّر أي إشارة في هذا التسجيل قيمتها.","plugged_in":"موصول: %s.","uds_bus":"أسئلة UDS تخرج فقط على CAN التشخيص (سنّا OBD ‏6/14، ‏CAN كلاسيكي 500 kbit/s عبر TGW / GWCANFD9، وظيفي 29 بت 0x18DBFFF1 أو فيزيائي 0x18DAxxF1)."},"he":{"ask_only":"אפשר לשאול. אי אפשר לשנות.","bus_note":"רק שאלות. שום דבר במשאית לא משתנה. CAN XL אינו זמין ב-PCAN-USB FD.","not_a_question":"המסגרת הזו אינה שאלת קריאה בלבד. מחיקה, איפוס, כתיבה, צריבה, גישת אבטחה ושליטה לא נשלחים.","plain_boundary":"הכלי הזה רק שואל נתונים. הוא לא כותב, לא צורב, לא פותח נעילה ולא שולט ברכב.","plain_nothing":"שום דבר לא מחובר. חברו מתאם USB-CAN למחשב הזה. אין צורך לדעת אם זה Peak,‏ ZLG או מותג אחר.","plain_driver":"מנהל ההתקן של המתאם חסר. התקינו את מנהל ההתקן שהגיע עם המתאם וחברו אותו שוב. אין צורך לבחור בין Peak ל-ZLG.","plain_bitrate":"המתאם בקצב שגוי. תקע האבחון צריך CAN קלאסי במהירות 500 kbit/s.","plain_power":"אפיק הרכב בלי מתח, או שכבל האבחון לא יושב. הדליקו הצתה ובדקו פין OBD ‏6 ו-14.","plug_brand":"חברו מתאם USB-CAN. אין צורך להכיר את המותג.","help_plug":"חברו מתאם USB-CAN, ואז: connect","help_brand":"אין צורך לדעת אם זה Peak,‏ ZLG או מותג אחר.","help_lang":"שפה אחת בכל פעם, מ-WR_LANG או --lang, אותה רשימה כמו ב-windrose.ai. אנגלית אם זה ריק או לא מוכר.","found":"נמצא: %s.","asked":"נשאלו מ-%s סשן, קודי תקלה ו-VIN בכתובת 0x18DBFFF1. ברכב לא שונה דבר.","heard":"נשמעה תעבורה והיא פוענחה במילון הציבורי.","quiet_bus":"לא חזרה שום הודעה. הדליקו הצתה והושיבו את הכבל בתקע האבחון.","uds_50":"סשן אבחון","uds_59":"מידע תקלות","uds_62":"ערך נתון","uds_7e":"הבוחן עדיין נוכח","uds_7f":"הרכב דחה את השאלה","uds_locked":"הרכב ביקש פתיחת אבטחה. הכלי הזה לא פותח נעילה.","response":"תשובה 0x%X: %s.","response_unknown":"תשובה 0x%X: %d בתים, לא במילון הציבורי.","plot_note":"חברו מתאם USB-CAN. אין צורך להכיר את המותג. מתאם CAN ‏(Peak,‏ ZLG, …). קובץ מקומי. הוא לא נשלח לעוזר. רק שאלות קריאה; הרכב לא משתנה.","plot_empty":"אף אות בהקלטה הזו לא שינה ערך.","plugged_in":"מחובר: %s.","uds_bus":"שאלות UDS יוצאות רק על CAN האבחון (פיני OBD ‏6/14,‏ CAN קלאסי 500 kbit/s דרך TGW / GWCANFD9, פונקציונלי 29 סיביות 0x18DBFFF1 או פיזי 0x18DAxxF1)."},"ja":{"ask_only":"質問はできます。変更はできません。","bus_note":"質問だけです。トラックの状態は変わりません。PCAN-USB FD では CAN XL は使えません。","not_a_question":"このフレームは読み取り専用の質問ではありません。消去、リセット、書き込み、書き換え、セキュリティ解除、制御は送りません。","plain_boundary":"このツールはデータを尋ねるだけです。書き込み、書き換え、ロック解除、車両の操作はしません。","plain_nothing":"何も接続されていません。USB-CAN アダプタをこのコンピュータに挿してください。Peak か ZLG か、ほかのメーカーかを知る必要はありません。","plain_driver":"アダプタのドライバがありません。付属のドライバを入れてから、もう一度挿してください。Peak と ZLG を選ぶ必要はありません。","plain_bitrate":"アダプタの通信速度が違います。診断コネクタはクラシック CAN、500 kbit/s です。","plain_power":"車両バスに電源がないか、診断ケーブルが奥まで入っていません。イグニッションを入れ、OBD の 6 番と 14 番を確認してください。","plug_brand":"USB-CAN アダプタを挿してください。メーカーを知る必要はありません。","help_plug":"USB-CAN アダプタを挿してから: connect","help_brand":"Peak か ZLG か、ほかのメーカーかを知る必要はありません。","help_lang":"一度に一つの言語です。WR_LANG または --lang。windrose.ai と同じ一覧です。空、または不明なときは英語です。","found":"見つかりました: %s。","asked":"%s に、セッション、故障コード、VIN を 0x18DBFFF1 で尋ねました。車両は何も変わっていません。","heard":"バス上の通信を受け、公開の辞書で読みました。","quiet_bus":"返事がありません。イグニッションを入れ、診断コネクタにケーブルを差し込んでください。","uds_50":"診断セッション","uds_59":"故障情報","uds_62":"データ値","uds_7e":"テスタはまだ接続中","uds_7f":"車両が質問を断りました","uds_locked":"車両がセキュリティ解除を求めています。このツールは解除しません。","response":"応答 0x%X: %s。","response_unknown":"応答 0x%X: %d バイト。公開の辞書にありません。","plot_note":"USB-CAN アダプタを挿してください。メーカーを知る必要はありません。CAN アダプタ（Peak、ZLG、ほか）。手元のファイルです。アシスタントには送りません。読み取りの質問だけです。車両は変わりません。","plot_empty":"この記録で値が変わった信号はありません。","plugged_in":"接続中: %s。","uds_bus":"UDS の質問は診断 CAN だけに出します（OBD の 6/14 番、TGW / GWCANFD9 経由のクラシック CAN 500 kbit/s、29 ビット機能 0x18DBFFF1 または物理 0x18DAxxF1）。"},"ko":{"ask_only":"물어볼 수 있습니다. 바꿀 수는 없습니다.","bus_note":"질문만 합니다. 트럭의 어떤 것도 바뀌지 않습니다. PCAN-USB FD에서는 CAN XL을 쓸 수 없습니다.","not_a_question":"이 프레임은 읽기 전용 질문이 아닙니다. 지우기, 리셋, 쓰기, 플래시, 보안 접근, 제어는 보내지 않습니다.","plain_boundary":"이 도구는 데이터만 묻습니다. 쓰거나, 플래시하거나, 잠금을 풀거나, 차량을 제어하지 않습니다.","plain_nothing":"아무것도 꽂혀 있지 않습니다. USB-CAN 어댑터를 이 컴퓨터에 꽂으세요. Peak인지 ZLG인지 다른 브랜드인지 알 필요가 없습니다.","plain_driver":"어댑터 드라이버가 없습니다. 어댑터와 함께 온 드라이버를 설치한 뒤 다시 꽂으세요. Peak와 ZLG 중에서 고르지 않아도 됩니다.","plain_bitrate":"어댑터 속도가 잘못되었습니다. 진단 커넥터는 클래식 CAN, 500 kbit/s가 필요합니다.","plain_power":"차량 버스에 전원이 없거나 진단 케이블이 덜 꽂혔습니다. 시동을 켜고 OBD 6번과 14번 핀을 확인하세요.","plug_brand":"USB-CAN 어댑터를 꽂으세요. 브랜드를 알 필요가 없습니다.","help_plug":"USB-CAN 어댑터를 꽂은 다음: connect","help_brand":"Peak인지 ZLG인지 다른 브랜드인지 알 필요가 없습니다.","help_lang":"한 번에 한 언어입니다. WR_LANG 또는 --lang. windrose.ai와 같은 목록입니다. 비어 있거나 모르면 영어입니다.","found":"찾음: %s.","asked":"%s에게 0x18DBFFF1에서 세션, 고장 코드, VIN을 물었습니다. 차량의 어떤 것도 바뀌지 않았습니다.","heard":"버스 트래픽을 듣고 공개 사전으로 풀었습니다.","quiet_bus":"응답이 없습니다. 시동을 켜고 진단 커넥터에 케이블을 끝까지 꽂으세요.","uds_50":"진단 세션","uds_59":"고장 정보","uds_62":"데이터 값","uds_7e":"테스터가 아직 있습니다","uds_7f":"차량이 질문을 거절했습니다","uds_locked":"차량이 보안 잠금 해제를 요청했습니다. 이 도구는 잠금을 풀지 않습니다.","response":"응답 0x%X: %s.","response_unknown":"응답 0x%X: %d바이트, 공개 사전에 없습니다.","plot_note":"USB-CAN 어댑터를 꽂으세요. 브랜드를 알 필요가 없습니다. CAN 어댑터(Peak, ZLG, …). 이 컴퓨터의 파일입니다. 도우미에게 보내지 않습니다. 읽기 질문만 하며 차량은 바뀌지 않습니다.","plot_empty":"이 기록에서 값이 바뀐 신호가 없습니다.","plugged_in":"연결됨: %s.","uds_bus":"UDS 질문은 진단 CAN으로만 나갑니다(OBD 6/14번, TGW / GWCANFD9를 거친 클래식 CAN 500 kbit/s, 29비트 기능 0x18DBFFF1 또는 물리 0x18DAxxF1)."}}};
  var LANG_ALIAS = {
    en_world: "en", en_us: "en", en_uk: "en", en_au: "en",
    zh_cn: "zh", zh_hans: "zh", zh_hant: "zh_tw",
    nb: "no", nn: "no", iw: "he"
  };
  function normLang(raw) {
    var text = String(raw || "").trim().toLowerCase().replace(/-/g, "_");
    if (!text || !I18N) return "";
    text = LANG_ALIAS[text] || text;
    if (I18N.langs.indexOf(text) >= 0) return text;
    var two = text.split("_")[0];
    two = LANG_ALIAS[two] || two;
    return I18N.langs.indexOf(two) >= 0 ? two : "";
  }
  function text(lang, key) {
    var code = normLang(lang) || "en";
    var pack = (I18N && I18N.copy[code]) || I18N.copy.en;
    if (pack[key] == null) pack = I18N.copy.en;
    return pack[key];
  }
  function htmlLocale(lang) {
    var code = normLang(lang) || "en";
    var tag = code === "zh" ? "zh-CN" : (code === "zh_tw" ? "zh-TW" : code);
    return { lang: tag, dir: (code === "ar" || code === "he") ? "rtl" : "ltr" };
  }
  var POLICY = text("en", "ask_only");
  var ADAPTER_LABEL = "CAN adapter (Peak, ZLG, …)";
  function serviceIsRead(payload) {
    if (!payload || !payload.length) return false;
    var sid = payload[0] & 255;
    if (BLOCKED[sid] || (!UDS_ASK[sid] && !OBD_READ[sid])) return false;
    if (sid === 0x10) {
      if (payload.length !== 2) return false;
      var session = payload[1] & 0x7f;
      return session === 0x01 || session === 0x03;
    }
    if (sid === 0x3e) {
      if (payload.length !== 2) return false;
      return (payload[1] & 0x7f) === 0x00;
    }
    if (sid === 0x22) return payload.length >= 3 && ((payload.length - 1) % 2) === 0;
    if (sid === 0x19) return payload.length >= 2 && (payload[1] & 0x7f) !== 0;
    return !!OBD_READ[sid];
  }
  function isWh13Request(canId, extended) {
    var id = canId >>> 0;
    var ext = !!extended || id > 0x7ff;
    if (!ext) return false;
    if (id === WH13_FUNCTIONAL) return true;
    return (id & 0xffff00ff) === 0x18da00f1 && ((id >>> 8) & 0xff) !== 0xf1;
  }
  function isJ1979Request(canId, extended) {
    var id = canId >>> 0;
    var ext = !!extended || id > 0x7ff;
    if (!ext) return id === 0x7df || (id >= 0x7e0 && id <= 0x7e7);
    return id === 0x18db33f1;
  }
  function udsReadFrames(session, target) {
    var which = session || "extended";
    var sub = which === "default" ? 0x01 : 0x03;
    if (which !== "default" && which !== "extended") return null;
    var id = WH13_FUNCTIONAL;
    if (target != null) {
      var n = target & 255;
      if ((target !== n) || n === 0xf1) return null;
      id = (0x18da00f1 | (n << 8)) >>> 0;
    }
    var bodies = [
      [0x02, 0x10, sub],
      [0x02, 0x3e, 0x00],
      [0x03, 0x22, 0xf1, 0x90],
      [0x03, 0x19, 0x02, 0xff]
    ];
    return bodies.map(function (body) {
      var data = body.slice();
      while (data.length < 8) data.push(0);
      return { id: id, data: data, ext: true };
    });
  }
  function isJ1939ReadRequest(canId, data, extended) {
    var id = canId >>> 0;
    var b = data || [];
    if (!(extended || id > 0x7ff)) return false;
    if (((id >>> 26) & 7) !== 6 || ((id >>> 25) & 1) || ((id >>> 24) & 1)) return false;
    if (((id >>> 16) & 0xff) !== 0xea || ((id >>> 8) & 0xff) !== 0xff || (id & 0xff) !== 0xfe) return false;
    if (b.length < 3) return false;
    var pgn = (b[0] & 255) | ((b[1] & 255) << 8) | ((b[2] & 255) << 16);
    if (!READ_PGN[pgn]) return false;
    for (var i = 3; i < b.length; i++) if ((b[i] & 255) !== 0xff && (b[i] & 255) !== 0) return false;
    return true;
  }
  function isInquiry(canId, data, extended) {
    var b = data || [];
    if (isJ1939ReadRequest(canId, b, extended)) return true;
    if (b.length < 2) return false;
    var pci = b[0] & 255;
    var onDiag = isWh13Request(canId, extended) || isJ1979Request(canId, extended);
    if (pci === 0x30) {
      if (!onDiag) return false;
      if (b.length < 3 || (b[1] & 255) !== 0 || (b[2] & 255) !== 0) return false;
      for (var i = 3; i < b.length; i++) if ((b[i] & 255) !== 0) return false;
      return true;
    }
    if (pci < 1 || pci > 7 || b.length < 1 + pci) return false;
    var payload = b.slice(1, 1 + pci);
    if (!serviceIsRead(payload)) return false;
    if (UDS_ASK[payload[0] & 255]) return isWh13Request(canId, extended);
    return isJ1979Request(canId, extended);
  }
  function j1939Request(name) {
    var key = String(name).toLowerCase();
    if (key === "dm3" || key === "dm11") return null;
    var pgn = READ_NAME[key];
    if (pgn == null) {
      var n = parseInt(key, key.indexOf("0x") === 0 ? 16 : 10);
      if (!READ_PGN[n]) return null;
      pgn = n;
    }
    return { id: 0x18eafffe, data: [pgn & 255, (pgn >> 8) & 255, (pgn >> 16) & 255, 0xff, 0xff, 0xff, 0xff, 0xff] };
  }

  function pgnParts(canId) {
    var n = canId >>> 0;
    var pf = (n >>> 16) & 0xff;
    var ps = (n >>> 8) & 0xff;
    var sa = n & 0xff;
    var pgn, da;
    if (pf < 240) {
      pgn = ((n >>> 25) & 1) * 131072 + ((n >>> 24) & 1) * 65536 + (pf << 8);
      da = ps;
    } else {
      pgn = ((n >>> 25) & 1) * 131072 + ((n >>> 24) & 1) * 65536 + (pf << 8) + ps;
      da = null;
    }
    return { pgn: pgn, sa: sa, da: da };
  }

  function bitOn(data, bit) {
    var i = bit >> 3;
    if (bit < 0 || i >= data.length) return 0;
    return (data[i] & (1 << (bit & 7))) ? 1 : 0;
  }

  function extractRaw(data, start, length, intel) {
    var val = 0;
    var i, bit;
    if (intel) {
      for (i = 0; i < length; i++) if (bitOn(data, start + i)) val |= 1 << i;
    } else {
      bit = start;
      for (i = 0; i < length; i++) {
        if (bitOn(data, bit)) val |= 1 << (length - 1 - i);
        if (i + 1 === length) break;
        if ((bit % 8) === 0) bit += 15;
        else bit -= 1;
      }
    }
    return val >>> 0;
  }

  function parseDbc(text) {
    var messages = {};
    var cur = null;
    var bo = /^BO_\s+(\d+)\s+(\w+)\s*:\s*(\d+)\s+/;
    var sg = /^SG_\s+(\w+)(?:\s+(M|m\d+))?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^)]+)\)\s*(?:\[[^\]]*\])?\s*"([^"]*)"/;
    text.split(/\r?\n/).forEach(function (line) {
      var s = line.trim();
      var m = bo.exec(s);
      if (m) {
        var full = parseInt(m[1], 10);
        cur = { id: full & 0x1fffffff, ext: full > 0x7ff, name: m[2], size: parseInt(m[3], 10), signals: [] };
        messages[cur.id] = cur;
        return;
      }
      m = sg.exec(s);
      if (m && cur && !(m[2] && m[2].charAt(0) === "m")) {
        cur.signals.push({
          name: m[1], start: parseInt(m[3], 10), length: parseInt(m[4], 10),
          intel: m[5] === "1", signed: m[6] === "-", factor: parseFloat(m[7]),
          offset: parseFloat(m[8]), unit: m[9]
        });
      }
    });
    return { messages: messages };
  }

  function signalValue(data, sig) {
    var raw = extractRaw(data, sig.start, sig.length, sig.intel);
    if (sig.signed && raw >= (1 << (sig.length - 1))) raw -= 1 << sig.length;
    return raw * sig.factor + sig.offset;
  }

  function decode(frames, dbc) {
    var rows = [];
    frames.forEach(function (fr) {
      var msg = dbc.messages[fr.id & 0x1fffffff];
      if (!msg) return;
      msg.signals.forEach(function (sig) {
        rows.push({ t: fr.t, message: msg.name, signal: sig.name, value: signalValue(fr.data, sig), unit: sig.unit || "" });
      });
    });
    return rows;
  }

  function plotHtml(frames, dbc, title, lang) {
    var buckets = {};
    decode(frames, dbc).forEach(function (row) {
      var key = row.message + "." + row.signal + "\t" + row.unit;
      (buckets[key] = buckets[key] || []).push(row);
    });
    var series = [];
    Object.keys(buckets).forEach(function (key) {
      var pts = buckets[key];
      if (pts.length < 2 || series.length >= 12) return;
      var lo = pts[0].value, hi = lo;
      pts.forEach(function (p) { if (p.value < lo) lo = p.value; if (p.value > hi) hi = p.value; });
      if (lo === hi) return;
      series.push({ key: key, pts: pts, lo: lo, hi: hi });
    });
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    var loc = htmlLocale(lang);
    var html = "<!DOCTYPE html><html lang=\"" + loc.lang + "\" dir=\"" + loc.dir + "\"><head><meta charset=\"utf-8\"><title>" + esc(title || "CAN plot") +
      "</title><style>body{background:#f6f5f2;color:#1c1c1c;font:14px -apple-system,sans-serif;margin:24px}" +
      "svg{background:#fff;border:1px solid #ddd;display:block;margin:8px 0 20px}" +
      "p.policy{font-weight:600;color:#1c1c1c}p.note{color:#555}</style></head><body><h1>" +
      esc(title || "CAN plot") + "</h1><p class=\"policy\">" + esc(text(lang, "ask_only")) +
      "</p><p class=\"note\">" + esc(text(lang, "plot_note")) + "</p>";
    if (!series.length) html += "<p>" + esc(text(lang, "plot_empty")) + "</p>";
    series.forEach(function (s) {
      var pts = s.pts, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var spanT = (t1 - t0) || 1, spanV = (s.hi - s.lo) || 1;
      var coords = pts.map(function (p) {
        var x = 28 + (p.t - t0) / spanT * 664;
        var y = 112 - (p.value - s.lo) / spanV * 84;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      html += "<h2>" + esc(s.key.split("\t")[0]) + "</h2><svg viewBox=\"0 0 720 140\" width=\"720\" height=\"140\"><polyline fill=\"none\" stroke=\"#1d4e89\" stroke-width=\"1.5\" points=\"" + coords + "\"/></svg>";
    });
    return html + "</body></html>";
  }

  function dtcs(payload) {
    var found = [], i = 2;
    while (i + 4 <= payload.length) {
      var c0 = payload[i], c1 = payload[i + 1], c2 = payload[i + 2], c3 = payload[i + 3];
      i += 4;
      if ((c0 | c1 | c2 | c3) === 0 || (c0 & c1 & c2 & c3) === 0xff) continue;
      if (c3 & 0x80) { found.push({ cm: 1, oc: c3 & 0x7f }); continue; }
      found.push({ cm: 0, spn: c0 | (c1 << 8) | ((c2 & 0xe0) << 3), fmi: c2 & 0x1f, oc: c3 & 0x7f });
    }
    return found;
  }

  function cpgWalk(data) {
    var out = [], i = 0;
    while (i + 4 <= data.length) {
      var b0 = data[i] & 255;
      var tos = (b0 >> 5) & 7;
      var tf = (b0 >> 2) & 7;
      if (tos === 0) break;
      var pgn = ((b0 & 3) << 16) | ((data[i + 1] & 255) << 8) | (data[i + 2] & 255);
      var length = data[i + 3] & 255;
      i += 4;
      if (length > 60 || i + length > data.length) break;
      var payload = [];
      for (var k = 0; k < length; k++) payload.push(data[i + k] & 255);
      i += length;
      out.push({ pgn: pgn, payload: tf ? null : payload, length: length, tf: tf });
    }
    return out;
  }

  function keepDtc(pgn, payload, sa, rows) {
    if (pgn !== 0xfeca || !payload) return;
    dtcs(payload).forEach(function (d) { d.sa = sa; rows.push(d); });
  }

  function absorbCpgs(data, sa, counts, rows, notes) {
    cpgWalk(data).forEach(function (item) {
      var key = item.pgn + ":" + sa + ":";
      counts[key] = (counts[key] || 0) + 1;
      if (item.tf) notes.push(item);
      else keepDtc(item.pgn, item.payload, sa, rows);
    });
  }

  function collectJ1939(frames) {
    var counts = {}, dtcsOut = [], notes = [], pending = {}, fdJobs = {}, rebuilt = 0;
    frames.forEach(function (fr) {
      var data = fr.data || [];
      var id = fr.id >>> 0;
      var ext = !!fr.ext || id > 0x7ff;
      if (!ext && fr.fd && id <= 0xff) { absorbCpgs(data, id & 0xff, counts, dtcsOut, notes); return; }
      if (!ext) return;
      var parts = pgnParts(id);
      var key = parts.pgn + ":" + parts.sa + ":" + (parts.da == null ? "" : parts.da);
      if (parts.pgn === 0xec00 && data.length >= 8 && data[0] === 0x20) {
        pending[parts.sa] = { size: data[1] | (data[2] << 8), npk: data[3], pgn: data[5] | (data[6] << 8) | (data[7] << 16), got: {} };
        counts[key] = (counts[key] || 0) + 1;
        return;
      }
      if (parts.pgn === 0xeb00 && pending[parts.sa] && data.length) {
        var job = pending[parts.sa];
        job.got[data[0]] = data.slice(1, 8);
        var n = Object.keys(job.got).length;
        if (n >= job.npk && job.npk) {
          var blob = [];
          for (var s = 1; s <= job.npk; s++) blob = blob.concat(job.got[s] || []);
          blob = blob.slice(0, job.size);
          rebuilt++;
          keepDtc(job.pgn, blob, parts.sa, dtcsOut);
          var carried = job.pgn + ":" + parts.sa + ":";
          counts[carried] = (counts[carried] || 0) + 1;
          delete pending[parts.sa];
        }
        counts[key] = (counts[key] || 0) + 1;
        return;
      }
      if (parts.pgn === 0x2500) {
        counts[key] = (counts[key] || 0) + 1;
        absorbCpgs(data, parts.sa, counts, dtcsOut, notes);
        return;
      }
      if (parts.pgn === 0x4d00) {
        counts[key] = (counts[key] || 0) + 1;
        if (data.length >= 12) {
          var session = (data[0] >> 4) & 15;
          var ctrl = data[0] & 15;
          var jobKey = parts.sa + ":" + session;
          if (ctrl === 15) delete fdJobs[jobKey];
          else if (ctrl === 0 || ctrl === 4) {
            var size = data[1] | (data[2] << 8) | (data[3] << 16);
            var nseg = data[4] | (data[5] << 8) | (data[6] << 16);
            var carriedPgn = data[9] | (data[10] << 8) | (data[11] << 16);
            if (nseg > 0 && nseg <= 256 && size <= nseg * 60) fdJobs[jobKey] = { size: size, nseg: nseg, pgn: carriedPgn, got: {} };
          }
        }
        return;
      }
      if (parts.pgn === 0x4e00) {
        counts[key] = (counts[key] || 0) + 1;
        if (data.length >= 4 && (data[0] & 15) === 0) {
          var sess = (data[0] >> 4) & 15;
          var fdJob = fdJobs[parts.sa + ":" + sess];
          if (fdJob) {
            var seg = data[1] | (data[2] << 8) | (data[3] << 16);
            fdJob.got[seg] = data.slice(4, 64);
            var ready = true;
            for (var si = 1; si <= fdJob.nseg; si++) if (!fdJob.got[si]) ready = false;
            if (fdJob.nseg && ready) {
              var blob2 = [];
              for (var sj = 1; sj <= fdJob.nseg; sj++) blob2 = blob2.concat(fdJob.got[sj] || []);
              blob2 = blob2.slice(0, fdJob.size);
              rebuilt++;
              keepDtc(fdJob.pgn, blob2, parts.sa, dtcsOut);
              var ck = fdJob.pgn + ":" + parts.sa + ":";
              counts[ck] = (counts[ck] || 0) + 1;
              delete fdJobs[parts.sa + ":" + sess];
            }
          }
        }
        return;
      }
      counts[key] = (counts[key] || 0) + 1;
      if (parts.pgn === 0xfeca) keepDtc(parts.pgn, data, parts.sa, dtcsOut);
    });
    return { counts: counts, dtcs: dtcsOut, notes: notes, rebuilt: rebuilt };
  }

  function j1939Report(frames) {
    var got = collectJ1939(frames);
    var extN = 0;
    frames.forEach(function (fr) { if (fr.ext) extN++; });
    var lines = ["J1939 listen", "extended frames " + extN, "reassembled " + got.rebuilt];
    Object.keys(got.counts).sort(function (a, b) { return got.counts[b] - got.counts[a]; }).forEach(function (key) {
      var bits = key.split(":");
      var pgn = parseInt(bits[0], 10);
      var name = PGN_NAMES[pgn] || "";
      var dest = bits[2] === "" ? "" : " DA 0x" + (parseInt(bits[2], 10) & 255).toString(16);
      lines.push("PGN " + pgn + " " + name + "  SA 0x" + (parseInt(bits[1], 10) & 255).toString(16) + dest + "  count " + got.counts[key]);
    });
    got.notes.forEach(function (item) { lines.push("C-PG PGN " + item.pgn + "  len " + item.length + "  assurance"); });
    if (!got.dtcs.length) lines.push("DM1: no DTC in this recording");
    got.dtcs.forEach(function (d) {
      if (d.cm) lines.push("DM1 SA 0x" + d.sa.toString(16) + "  conversion method 1  OC " + d.oc);
      else lines.push("DM1 SA 0x" + d.sa.toString(16) + "  SPN " + d.spn + "  FMI " + d.fmi + "  OC " + d.oc);
    });
    return lines.join("\n") + "\n";
  }

  var KNOWN = {
    "0c72:000c": ["Peak PCAN-USB", "peak"],
    "0c72:000d": ["Peak PCAN-USB Pro", "peak"],
    "0c72:0011": ["Peak PCAN-USB FD", "peak"],
    "0c72:0012": ["Peak PCAN-USB Pro FD", "peak"],
    "0c72:0013": ["Peak PCAN-USB Chip", "peak"],
    "0c72:0014": ["Peak PCAN-USB X6", "peak"],
    "0471:1200": ["ZLG USBCAN", "zlg"],
    "1d50:606f": ["candleLight USB-CAN", "socketcan"]
  };
  function hex4(n) { return ("0000" + (n & 0xffff).toString(16)).slice(-4); }
  function plainAdapterName(dev) {
    dev = dev || {};
    var vid = dev.vid, pid = dev.pid;
    if (vid != null && pid != null) {
      var key = hex4(vid) + ":" + hex4(pid);
      if (KNOWN[key]) return KNOWN[key][0];
      if ((vid & 0xffff) === 0x0c72) return "Peak USB-CAN";
      if ((vid & 0xffff) === 0x0bfd) return "Kvaser USB-CAN";
    }
    var manufacturer = String(dev.manufacturer || "").trim();
    var product = String(dev.product || "").trim();
    if (manufacturer && product) return manufacturer + " " + product;
    if (product) return product;
    if (manufacturer) return manufacturer;
    if (vid != null && pid != null) return "unknown USB-CAN, VID:PID " + hex4(vid) + ":" + hex4(pid);
    if (dev.iface) return "SocketCAN " + dev.iface;
    return "unknown USB-CAN";
  }
  function connectPage(found, lines, lang) {
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    var loc = htmlLocale(lang);
    var html = "<!DOCTYPE html><html lang=\"" + loc.lang + "\" dir=\"" + loc.dir + "\"><head><meta charset=\"utf-8\"><title>Windrose Diagnose</title>" +
      "<style>body{background:#f6f5f2;color:#1c1c1c;font:15px -apple-system,sans-serif;margin:24px}" +
      "p.policy{font-weight:600}</style></head><body><h1>Windrose Diagnose</h1>" +
      "<p class=\"policy\">" + esc(text(lang, "ask_only")) + "</p>" +
      "<p>" + esc(text(lang, "plug_brand")) + "</p>";
    var nothing = text(lang, "plain_nothing");
    if ((!found || !found.length) && String((lines || []).join("\n")).indexOf(nothing) < 0) html += "<p>" + esc(nothing) + "</p>";
    else {
      html += "<ul>";
      found.forEach(function (dev) { html += "<li>" + esc(plainAdapterName(dev)) + "</li>"; });
      html += "</ul>";
    }
    (lines || []).forEach(function (line) { html += "<p>" + esc(line) + "</p>"; });
    return html + "</body></html>";
  }

  return {
    policy: POLICY,
    langs: I18N.langs,
    copy: I18N.copy,
    normLang: normLang,
    text: text,
    adapterLabel: ADAPTER_LABEL,
    plainAdapterName: plainAdapterName,
    connectPage: connectPage,
    isInquiry: isInquiry,
    serviceIsRead: serviceIsRead,
    udsReadFrames: udsReadFrames,
    j1939Request: j1939Request,
    j1939Dtcs: function (frames) { return collectJ1939(frames).dtcs; },
    pgnParts: pgnParts,
    extractRaw: extractRaw,
    parseDbc: parseDbc,
    signalValue: signalValue,
    decode: decode,
    plotHtml: plotHtml,
    j1939Report: j1939Report
  };
});
