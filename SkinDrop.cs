// SkinDrop.cs — SKINDROP с обратным отсчётом до следующего розыгрыша
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Plugins;
using Oxide.Game.Rust.Cui;
using UnityEngine;
using UnityEngine.Networking;
using System.IO;

namespace Oxide.Plugins
{
    [Info("SkinDrop", "Sempai + DropRust", "1.1.0")]
    class SkinDrop : RustPlugin
    {
        // --------------------------- Ссылки и данные ---------------------------
        [PluginReference] Plugin TPEconomic, TPMenuSystem;

        private List<Drop> DB = new List<Drop>();
        private Dictionary<ulong, string> UrlTrade = new Dictionary<ulong, string>();
        private Dictionary<ulong, GiveSkin> GivsDrop = new Dictionary<ulong, GiveSkin>();

        // Таймеры обратного отсчёта только для тех игроков, у кого открыт SKINDROP
        private readonly Dictionary<ulong, Timer> _countdownTimers = new Dictionary<ulong, Timer>();
        // Время следующего автодропа (UTC)
        private DateTime _nextDrawAtUtc = DateTime.MinValue;
        private Timer _autoDrawTimer;
        private Timer _warningTimer;

        // --------------------------- Модели ---------------------------
        public class Drop
        {
            [JsonProperty("Ник игрока")] public string DisplayName;
            [JsonProperty("Название предмета")] public string ShortName;
            [JsonProperty("Название скина как в стим")] public string SkinName;
            [JsonProperty("SkinID предмета")] public ulong SkinID;
            [JsonProperty("Ссылка на картинку скина")] public string Url;
            [JsonProperty("Цена предмета")] public float Price;
            [JsonProperty("Время и дата")] public string TimeDate;
            [JsonProperty("Покупка")] public bool Purchased;
        }

        public class GiveSkin
        {
            public string DisplayName;
            public string ShortName;
            public string SkinName;
            public string SkinID;
            public string Url;
            public string Price;
        }

        public class PrizeSkin
        {
            [JsonProperty("ShortName")] public string ShortName;
            [JsonProperty("SkinID")] public ulong SkinID;
            [JsonProperty("SkinName")] public string SkinName;
            [JsonProperty("Price")] public float Price;
            [JsonProperty("Quantity")] public int Quantity = 1;
        }

        // --------------------------- Конфиг ---------------------------
        public Configuration config;

        public class Configuration
        {
            [JsonProperty("Описание плагина")] public string Info =
                "<b>SKINDROP — скин для активных игроков!</b>\n<size=11>Пока вы играете, система периодически случайно выбирает победителей и показывает их здесь. Обязательно укажите трейд-ссылку ниже, чтобы мы могли отправить приз.\n\n<b>Выдача призов:</b> все скины за день отправляются <color=#DC143C>в конце дня</color> всем победителям.</size>";

            [JsonProperty("Пермишен для выдачи скинов")] public string Perm = "skindrop.use";
            [JsonProperty("Через сколько дестроить уведомление")] public float TimeAlert = 5f;

            [JsonProperty("Webhook")] public string WebhookNotify;
            [JsonProperty("Webhook 2")] public string WebhookDropNotify;
            [JsonProperty("Webhook покупок в магазине")] public string WebhookShopNotify;
            [JsonProperty("Цвет сообщения в Discord (Можно найти на сайте - https://old.message.style/dashboard в разделе JSON)")] public int Color;
            [JsonProperty("Заголовок сообщения")] public string AuthorName;
            [JsonProperty("Ссылка на иконку для аватарки сообщения")] public string IconURL;

            [JsonProperty("Интервал автодропа (минут)")] public int AutoDrawIntervalMinutes = 60;
            [JsonProperty("Время предварительного уведомления (минут)")] public int WarningMinutes = 15;

            // Интеграция со Steam-ботом
            [JsonProperty("SteamBotEnabled")] public bool SteamBotEnabled = false;
            [JsonProperty("SteamBotUrl")] public string SteamBotUrl = "http://127.0.0.1:3000/api/send";
            [JsonProperty("SteamBotToken")] public string SteamBotToken = "";
            // transport: http | file (очередь в data)
            [JsonProperty("SteamBotTransport")] public string SteamBotTransport = "http";
            // относительный путь к файлу очереди (от oxide/data), без расширения
            [JsonProperty("SteamBotQueueFile")] public string SteamBotQueueFile = "SkinDrop/bot-queue";

            [JsonProperty("Список призовых скинов для автодропа")] public List<PrizeSkin> PrizeSkins = new List<PrizeSkin>
            {
                new PrizeSkin
                {
                    ShortName = "rifle.ak",
                    SkinID = 1234567890,
                    SkinName = "AK-47 | Example Skin",
                    Price = 100.0f,
                    Quantity = 3
                }
            };

            // Категории магазина (вкладки)
            [JsonProperty("Категории магазина")] public List<ShopCategory> Categories = new List<ShopCategory>();
        }

        // --------------------------- Магазин: модели ---------------------------
        public class ShopSkinItem
        {
            [JsonProperty("ShortName")] public string ShortName;
            [JsonProperty("SkinID")] public ulong SkinID;
            [JsonProperty("SkinName")] public string SkinName;
            [JsonProperty("Price")] public float Price; // стоимость в монетах
            [JsonProperty("Quantity")] public int Quantity = -1; // остаток (−1 = бесконечно)
            [JsonProperty("GiveCount")] public int GiveCount = 1; // сколько выдавать за покупку
        }

        public class ShopCategory
        {
            [JsonProperty("Название вкладки")] public string Name;
            [JsonProperty("Товары")] public List<ShopSkinItem> Items = new List<ShopSkinItem>();
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                config = Config.ReadObject<Configuration>();
                if (config == null) LoadDefaultConfig();
            }
            catch
            {
                LoadDefaultConfig();
            }
            SaveConfig();

            // >>> ЕДИНСТВЕННОЕ ДОБАВЛЕНИЕ: сразу подтягиваем интервал из конфига в момент загрузки
            // чтобы обратный отсчёт в UI сходу показывал нужное значение (например, 30 минут).
            _nextDrawAtUtc = DateTime.UtcNow.AddMinutes(Mathf.Max(1, config.AutoDrawIntervalMinutes));

            // Автозаполнение примерами магазина при пустом списке
            EnsureDefaultShopItems();
            SaveConfig();
        }

        private void EnsureDefaultShopItems()
        {
            if (config.Categories == null || config.Categories.Count == 0)
                config.Categories = new List<ShopCategory>();

            if (!config.Categories.Any(c => c.Items != null && c.Items.Count > 0))
            {
                config.Categories = new List<ShopCategory>
                {
                    new ShopCategory
                    {
                        Name = "Rust",
                        Items = new List<ShopSkinItem>
                        {
                            new ShopSkinItem{ ShortName = "rifle.ak",           SkinID = 0UL,          SkinName = "RUST | AK-47",                    Price = 100, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "rifle.lr300",       SkinID = 0UL,          SkinName = "RUST | LR-300",                  Price = 120, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "smg.2",              SkinID = 0UL,          SkinName = "RUST | Custom SMG",              Price = 80,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "smg.thompson",       SkinID = 0UL,          SkinName = "RUST | Thompson",                Price = 90,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "pistol.m92",         SkinID = 0UL,          SkinName = "RUST | M92",                     Price = 60,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "pistol.python",      SkinID = 0UL,          SkinName = "RUST | Python",                  Price = 70,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "shotgun.pump",       SkinID = 0UL,          SkinName = "RUST | Pump Shotgun",            Price = 75,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "shotgun.doublebarrel", SkinID = 0UL,        SkinName = "RUST | Double Barrel",            Price = 65,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "rifle.bolt",         SkinID = 0UL,          SkinName = "RUST | Bolt Action",             Price = 140, Quantity = 9 }
                        }
                    },
                    new ShopCategory
                    {
                        Name = "CS",
                        Items = new List<ShopSkinItem>
                        {
                            new ShopSkinItem{ ShortName = "hoodie",                SkinID = 0UL, SkinName = "CS | Hoodie",              Price = 50,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "pants",                 SkinID = 0UL, SkinName = "CS | Pants",               Price = 45,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "tshirt.long",           SkinID = 0UL, SkinName = "CS | Longsleeve T-Shirt", Price = 30,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "mask.balaclava",        SkinID = 0UL, SkinName = "CS | Balaclava",          Price = 25,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "metal.plate.helmet",    SkinID = 0UL, SkinName = "CS | Metal Helmet",       Price = 90,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "metal.plate.torso",     SkinID = 0UL, SkinName = "CS | Metal Chestplate",   Price = 110, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "roadsign.jacket",       SkinID = 0UL, SkinName = "CS | Roadsign Jacket",    Price = 85,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "roadsign.kilt",         SkinID = 0UL, SkinName = "CS | Roadsign Kilt",      Price = 80,  Quantity = 9 },
                            new ShopSkinItem{ ShortName = "gloves.tactical",       SkinID = 0UL, SkinName = "CS | Tactical Gloves",    Price = 40,  Quantity = 9 }
                        }
                    },
                    new ShopCategory
                    {
                        Name = "Dota",
                        Items = new List<ShopSkinItem>
                        {
                            new ShopSkinItem{ ShortName = "hatchet",              SkinID = 0UL, SkinName = "DOTA | Hatchet",          Price = 20, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "pickaxe",              SkinID = 0UL, SkinName = "DOTA | Pickaxe",          Price = 20, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "knife.bone",           SkinID = 0UL, SkinName = "DOTA | Bone Knife",       Price = 15, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "mace",                 SkinID = 0UL, SkinName = "DOTA | Mace",             Price = 25, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "spear.wooden",         SkinID = 0UL, SkinName = "DOTA | Wooden Spear",     Price = 10, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "spear.stone",          SkinID = 0UL, SkinName = "DOTA | Stone Spear",      Price = 12, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "salvaged.cleaver",     SkinID = 0UL, SkinName = "DOTA | Cleaver",          Price = 22, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "sickle",               SkinID = 0UL, SkinName = "DOTA | Sickle",           Price = 18, Quantity = 9 },
                            new ShopSkinItem{ ShortName = "rock",                 SkinID = 0UL, SkinName = "DOTA | Rock",             Price = 5,  Quantity = 9 }
                        }
                    }
                };
            }
        }

        protected override void LoadDefaultConfig()
        {
            config = new Configuration();
            EnsureDefaultShopItems();
            SaveConfig();
        }
        protected override void SaveConfig() => Config.WriteObject(config, true);

        // --------------------------- Жизненный цикл ---------------------------
        void OnServerInitialized()
        {
            DB = Interface.Oxide.DataFileSystem.ReadObject<List<Drop>>($"{Name}/DropList");
            permission.RegisterPermission(config.Perm, this);

            // Инициализация ImageLibrary больше не требуется — все изображения из локальной папки

            // Локальные картинки из TPSystem/TPSkinDrop/images/
            if (_shopImageUI == null)
            {
                _shopImageUI = new ImageUI();
                _shopImageUI.DownloadAllImages();
            }

            // Предзагрузка не требуется — изображения берутся из локальной папки

            StartAutoDraw();
        }

        void Unload()
        {
            SaveDataBase();
            // Останавливаем все тики обратного отсчёта
            foreach (var t in _countdownTimers.Values) t?.Destroy();
            _countdownTimers.Clear();
            _autoDrawTimer?.Destroy();
            _warningTimer?.Destroy();
        }

        void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            StopCountdown(player);
        }

        // --------------------------- Автодроп и предупреждения ---------------------------
        private void StartAutoDraw()
        {
            _autoDrawTimer?.Destroy();
            _warningTimer?.Destroy();

            var interval = Mathf.Max(1, config.AutoDrawIntervalMinutes);
            // Первый запуск через interval минут от текущего момента
            _nextDrawAtUtc = DateTime.UtcNow.AddMinutes(interval);

            _autoDrawTimer = timer.Every(interval * 60f, () =>
            {
                AutoDrawRoutine();
                // после розыгрыша назначаем следующее время
                _nextDrawAtUtc = DateTime.UtcNow.AddMinutes(interval);
            });

            if (config.WarningMinutes > 0 && config.WarningMinutes < interval)
            {
                _warningTimer = timer.Every((interval - config.WarningMinutes) * 60f, SendWarningMessage);
            }
        }

        private void SendWarningMessage()
        {
            var availableSkins = config.PrizeSkins?.Where(s => s.Quantity > 0).ToList();
            if (availableSkins == null || availableSkins.Count == 0) return;

            var skin = availableSkins.GetRandom();
            foreach (var player in BasePlayer.activePlayerList)
            {
                player.ChatMessage("<color=#DC143C><size=16><b>SKIN DROP</b></size></color>");
                player.ChatMessage($"<color=#FFD700>Через {config.WarningMinutes} мин. состоится розыгрыш скина!</color>");
                player.ChatMessage($"Приз: <color=#00FF00>{skin.SkinName}</color> — <color=#FFD700>${skin.Price}</color>");
				player.ChatMessage("<color=#87CEFA>Не забудьте ввести свою трейд-ссылку в меню:</color> <color=#00FFFF>/menu -> SKINDROP</color>");
            }
        }

        private void AutoDrawRoutine()
        {
            var availableSkins = config.PrizeSkins?.Where(s => s.Quantity > 0).ToList();
            var players = BasePlayer.activePlayerList.ToList();

            if (availableSkins == null || availableSkins.Count == 0 || players.Count == 0) return;

            var skin = availableSkins.GetRandom();
            var player = players.GetRandom();

            skin.Quantity--;

            var now = DateTime.Now;
            DB.Add(new Drop
            {
                DisplayName = player.displayName,
                ShortName = skin.ShortName,
                SkinName = skin.SkinName,
                SkinID = skin.SkinID,
                Price = skin.Price,
                TimeDate = $"{now.ToShortTimeString()} {now:dd.MM.yy}"
            });
            SaveDataBase();

            AlertUI(player, player.displayName, skin.ShortName, skin.SkinID);
            TrySendToSteamBot(player, skin.ShortName, skin.SkinID, 1);
            var fields = Drop_Player(player, skin.SkinName, $"https://steamcommunity.com/sharedfiles/filedetails/?id={skin.SkinID}", skin.Price.ToString());
            SendDiscord(config.WebhookDropNotify, fields, null, new Thumbnail($"https://steamcommunity.com/sharedfiles/filedetails/?id={skin.SkinID}"), config.Color);

            // Обновим надпись у тех, у кого открыт UI (на следующем тике обновится сам)
        }

        private void SaveDataBase() => Interface.Oxide.DataFileSystem.WriteObject($"{Name}/DropList", DB);

        // --------------------------- Команды ---------------------------
        [ConsoleCommand("dropskin")]
        void ConsoleTrade(ConsoleSystem.Arg args)
        {
            var player = args.Player();
            if (player == null) return;

            if (!UrlTrade.ContainsKey(player.userID)) UrlTrade[player.userID] = "";
            if (!GivsDrop.ContainsKey(player.userID)) GivsDrop[player.userID] = new GiveSkin();

            if (!args.HasArgs(1))
            {
                SkinDropUI(player);
                return;
            }

            var sub = args.Args[0];

            if (sub == "give")
            {
                GiveDropUI(player);
            }
            else if (sub == "back")
            {
                SkinDropUI(player);
            }
            else if (sub == "close")
            {
                StopCountdown(player);
            }
            else if (sub == "tradeurl")
            {
                var trade = string.Join("", args.Args.Skip(1));
                if (string.IsNullOrEmpty(trade)) return;

                if (!trade.StartsWith("http://") && !trade.StartsWith("https://"))
                {
                    SendReply(player, "Ошибка! Введите корректную ссылку, начинающуюся с http:// или https://");
                    return;
                }
                UrlTrade[player.userID] = trade;
                SendReply(player, "Трейд-ссылка успешно сохранена!");
            }
            else if (sub == "sendds")
            {
                if (UrlTrade[player.userID] == "") return;
                var fields = DT_PlayerSendTrade(player, UrlTrade[player.userID]);
                SendDiscord(config.WebhookNotify, fields, new Authors(player.displayName, "", "", ""), null, config.Color);
                UrlTrade.Remove(player.userID);
                SendReply(player, "Вы успешно отправили свою трейд-ссылку!");
                SkinDropUI(player);
            }
            else if (sub == "name")
            {
                if (!args.HasArgs(2)) return;
                var target = FindBasePlayer(args.Args[1]);
                if (target == null)
                {
                    SendReply(player, $"Игрок {args.Args[1]} не найден");
                    return;
                }
                GivsDrop[player.userID].DisplayName = target.displayName;
            }
            else if (sub == "shortname")
            {
                GivsDrop[player.userID].ShortName = string.Join("", args.Args.Skip(1));
            }
            else if (sub == "skinname")
            {
                GivsDrop[player.userID].SkinName = string.Join("%20", args.Args.Skip(1));
            }
            else if (sub == "skinid")
            {
                GivsDrop[player.userID].SkinID = string.Join("", args.Args.Skip(1));
            }
            else if (sub == "url")
            {
                GivsDrop[player.userID].Url = string.Join("", args.Args.Skip(1));
            }
            else if (sub == "price")
            {
                GivsDrop[player.userID].Price = string.Join("", args.Args.Skip(1));
            }
            else if (sub == "send")
            {
                if (!permission.UserHasPermission(player.UserIDString, config.Perm)) return;
                var date = DateTime.Now;

                if (GivsDrop[player.userID].DisplayName == null ||
                    GivsDrop[player.userID].ShortName == null ||
                    GivsDrop[player.userID].SkinName == null ||
                    GivsDrop[player.userID].SkinID == null ||
                    GivsDrop[player.userID].Url == null ||
                    GivsDrop[player.userID].Price == null)
                {
                    SendReply(player, "Вы не указали все данные!");
                    return;
                }

                var target = FindBasePlayer(GivsDrop[player.userID].DisplayName);

                DB.Add(new Drop
                {
                    DisplayName = target.displayName,
                    ShortName = GivsDrop[player.userID].ShortName,
                    SkinName = GivsDrop[player.userID].SkinName,
                    SkinID = ulong.Parse(GivsDrop[player.userID].SkinID),
                    Url = GivsDrop[player.userID].Url,
                    Price = float.Parse(GivsDrop[player.userID].Price),
                    TimeDate = $"{date.ToShortTimeString()} {date:dd.MM.yy}"
                });
                foreach (var check in BasePlayer.activePlayerList)
                    AlertUI(check, GivsDrop[player.userID].DisplayName, GivsDrop[player.userID].ShortName, ulong.Parse(GivsDrop[player.userID].SkinID));

                var fields = Drop_Player(target, GivsDrop[player.userID].SkinName, $"https://steamcommunity.com/sharedfiles/filedetails/?id={GivsDrop[player.userID].SkinID}", GivsDrop[player.userID].Price);
                SendDiscord(config.WebhookDropNotify, fields, null, new Thumbnail($"https://steamcommunity.com/sharedfiles/filedetails/?id={GivsDrop[player.userID].SkinID}"), config.Color);

                // Если такой скин есть в конфиге — уменьшим остаток
                var skinInConfig = config.PrizeSkins.FirstOrDefault(s => s.ShortName == GivsDrop[player.userID].ShortName && s.SkinID == ulong.Parse(GivsDrop[player.userID].SkinID));
                if (skinInConfig != null && skinInConfig.Quantity > 0)
                {
                    skinInConfig.Quantity--;
                    SaveConfig();
                }

                GivsDrop.Remove(player.userID);
                GiveDropUI(player);
            }
        }

        // --------------------------- UI ---------------------------
        private void SkinDropUI(BasePlayer player)
        {
            // Закрываем и запускаем отсчёт с нуля
            StopCountdown(player);
            CuiHelper.DestroyUi(player, "skindrop.Main");

            var container = new CuiElementContainer();

            container.Add(new CuiElement
            {
                Name = "skindrop.Main",
                Parent = ".Mains",
                Components =
                {
                    new CuiRawImageComponent { Png = _shopImageUI?.GetImage("skindrop") },
                    new CuiRectTransformComponent { AnchorMin = "-0.315 -0.27", AnchorMax = "1.3 1.275" }
                }
            });

            // Кнопка "Закрыть меню" (крестик)
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.802 0.806", AnchorMax = "0.815 0.829" }, // обновлено
                Button = { Close = "Menu_UI", Color = "0 0 0 0" },
                Text = { Text = "" }
            }, "skindrop.Main");

            // ДОБАВЛЕНО: Невидимые кнопки категорий на главном экране (RUST / CS / DOTA)
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.243 0.737", AnchorMax = "0.261 0.802" },
                Button = { Color = "0 0 0 0", Command = "skindrop.tab 0; skindrop.shop page 0" },
                Text = { Text = "" }
            }, "skindrop.Main");
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.269 0.737", AnchorMax = "0.287 0.802" },
                Button = { Color = "0 0 0 0", Command = "skindrop.tab 1; skindrop.shop page 0" },
                Text = { Text = "" }
            }, "skindrop.Main");
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.294 0.737", AnchorMax = "0.312 0.801" },
                Button = { Color = "0 0 0 0", Command = "skindrop.tab 2; skindrop.shop page 0" },
                Text = { Text = "" }
            }, "skindrop.Main");

            // Кнопка "Выдать" только для модераторов с правом
            if (permission.UserHasPermission(player.UserIDString, config.Perm))
            {
                container.Add(new CuiButton
                {
                    RectTransform = { AnchorMin = "0.76 0.804", AnchorMax = "0.8 0.832" },
                    Button = { Color = "0 0 0 0", Command = "dropskin give" },
                    Text = { Text = "Выдать", Color = "1 1 1 0.6", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
                }, "skindrop.Main");
            }

            // Описание слева
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.27 0.4", AnchorMax = "0.5 0.69" },
                Button = { Color = "0 0 0 0" },
                Text = { Text = config.Info, Color = "1 1 1 0.4", FontSize = 14, Align = TextAnchor.UpperCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.Main");

            // ----- Блок обратного отсчёта -----
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.330 0.246", AnchorMax = "0.419 0.300" }, // обновлено
                Image = { Color = "0 0 0 0" }
            }, "skindrop.Main", "skindrop.CountdownBox");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0.7", AnchorMax = "1 1" },
                Text = { Text = "До следующего розыгрыша:", Color = "1 1 1 0.6", FontSize = 12, Align = TextAnchor.LowerCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.CountdownBox");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0.75" },
                Text = { Text = "—:—:—", Color = "1 1 1 0.95", FontSize = 24, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf" }
            }, "skindrop.CountdownBox", "skindrop.CountdownText");

            // ДОБАВЛЕНО: Баланс игрока (жёлтая цифра, только число)
            float __amountBalance = 0f;
            try
            {
                var __bal = TPEconomic?.Call("API_GET_BALANCE", (ulong)player.userID);
                if (__bal is float) __amountBalance = (float)__bal;
                else if (__bal is double) __amountBalance = (float)(double)__bal;
                else if (__bal is int) __amountBalance = (int)__bal;
            }
            catch { __amountBalance = 0f; }

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0.715 0.731", AnchorMax = "0.748 0.796" }, // новые якоря
                Text = { Text = ((int)__amountBalance).ToString(), Color = "1 1 0 0.95", Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf", FontSize = 16 }
            }, "skindrop.Main");

            // Поле ввода трейд-ссылки
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.218 0.445", AnchorMax = "0.467 0.497" }, // обновлено
                Image = { Color = "0 0 0 0" }
            }, "skindrop.Main", "FieldTrade");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0.04 0", AnchorMax = "1 1" },
                Text = { Text = "", Color = "1 1 1 0.05", FontSize = 10, Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf" }
            }, "FieldTrade", "TradeText");

            container.Add(new CuiElement
            {
                Parent = "FieldTrade",
                Components =
                {
                    new CuiInputFieldComponent { Command = "dropskin tradeurl ", Text = "", Color = "1 1 1 0.3", Align = TextAnchor.MiddleLeft, FontSize = 12, Font = "robotocondensed-regular.ttf", NeedsKeyboard = true },
                    new CuiRectTransformComponent { AnchorMin = "0.04 0", AnchorMax = "1 1" }
                }
            });

            // Кнопка "КУПИТЬ СКИНЫ" — переходит в магазин
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.523 0.734", AnchorMax = "0.594 0.775" }, // обновлено
                Button = { Color = "0 0 0 0", Command = "skindrop.shop page 0" },
                Text = { Text = "КУПИТЬ СКИНЫ", Color = "1 1 1 0.8", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.Main");

            // Кнопка "Отправить" трейд-ссылку
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.477 0.445", AnchorMax = "0.508 0.499" }, // обновлено
                Button = { Color = "0 0 0 0", Command = "dropskin sendds" },
                Text = { Text = "Отправить", Color = "1 1 1 0.8", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.Main");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0.260 0.25", AnchorMax = "0.5 0.28" },
                Text = { Text = "Пример: http://steamcommunity.com/my/tradeoffers/privacy", Color = "1 1 1 0.4", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.Main");

            // Правый список победителей
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.531 0.240", AnchorMax = "0.780 0.659" }, // обновлено
                Image = { Color = "0 0 0 0" }
            }, "skindrop.Main", "DropTop");

            int page = Math.Max(0, DB.Count - 8);
            float width = 1f, height = 0.117f, startxBox = 0f, startyBox = 0.999f - height, xmin = startxBox, ymin = startyBox;

            var last = DB.Skip(page).Take(8).ToList();
            last.Reverse(); // показываем последние сверху вниз
            foreach (var check in last)
            {
                container.Add(new CuiPanel
                {
                    RectTransform = { AnchorMin = $"{xmin} {ymin}", AnchorMax = $"{xmin + width} {ymin + height}", OffsetMin = "2 2", OffsetMax = "-2 -2" },
                    Image = { Color = "0 0 0 0" }
                }, "DropTop", "Top");

                xmin += width;
                if (xmin + width >= 1)
                {
                    xmin = startxBox;
                    ymin -= height + 0.01f;
                }

                container.Add(new CuiPanel
                {
                    RectTransform = { AnchorMin = "0.02 0", AnchorMax = "0.15 1" },
                    Image = { Color = "0 0 0 0" }
                }, "Top", "Image");

                container.Add(new CuiElement
                {
                    Parent = "Image",
                    Components =
                    {
                        new CuiImageComponent { ItemId = ItemManager.FindItemDefinition(check.ShortName).itemid, SkinId = check.SkinID },
                        new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "4 4", OffsetMax = "-4 -4" }
                    }
                });

                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0.19 0", AnchorMax = "0.7 1" },
                    Text = { Text = $"<b><color=#FFFFFF99>{check.DisplayName}</color></b>\n<size=10>{check.TimeDate}</size>", Color = "1 1 1 0.4", FontSize = 11, Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf" }
                }, "Top");

                // Цена и метка «Куплен» при необходимости
                string rightText = check.Purchased ? $"Куплен\n<size=10>{check.Price} ₽</size>" : $"{check.Price} ₽";
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0.825 0.21", AnchorMax = "0.97 0.79" },
                    Text = { Text = rightText, Color = "1 1 1 0.8", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
                }, "Top");
            }

            CuiHelper.AddUi(player, container);

            // Стартуем обратный отсчёт
            StartCountdown(player);
        }

        // --------------------------- Вкладка магазина ---------------------------
        private const string ShopRoot = "skindrop.Shop";
        // Локальный загрузчик картинок, совместимый с TPBaraxolka
        private static ImageUI _shopImageUI;
        // Состояние активной категории по игрокам
        private readonly Dictionary<ulong, int> _currentCategory = new Dictionary<ulong, int>();

        private class ImageUI
        {
            private const string PathRel = "TPSystem/TPSkinDrop/images/";
            private readonly Dictionary<string, ImageData> _images = new Dictionary<string, ImageData>(StringComparer.OrdinalIgnoreCase);

            private class ImageData { public string Id; public bool Loaded; }

            public string GetImage(string name)
            {
                if (string.IsNullOrWhiteSpace(name)) return null;
                ImageData img;
                if (_images.TryGetValue(name, out img) && img.Loaded)
                    return img.Id;

                // Попытка ленивой загрузки по ключу
                if (TryLoadAndStore(name))
                    return _images[name].Id;
                return null;
            }

            public void DownloadAllImages()
            {
                try
                {
                    var folder = System.IO.Path.Combine(Interface.Oxide.DataDirectory, PathRel);
                    if (!Directory.Exists(folder)) return;
                    foreach (var file in Directory.GetFiles(folder, "*.png", SearchOption.TopDirectoryOnly))
                    {
                        var key = System.IO.Path.GetFileNameWithoutExtension(file);
                        TryLoadAndStore(key);
                    }
                }
                catch { }
            }

            private bool TryLoadAndStore(string key)
            {
                try
                {
                    var filePath = System.IO.Path.Combine(Interface.Oxide.DataDirectory, PathRel, key + ".png");
                    if (!System.IO.File.Exists(filePath)) return false;
                    var bytes = System.IO.File.ReadAllBytes(filePath);
                    var id = FileStorage.server.Store(bytes, FileStorage.Type.png, CommunityEntity.ServerInstance.net.ID).ToString();
                    _images[key] = new ImageData { Id = id, Loaded = true };
                    return true;
                }
                catch { return false; }
            }
        }

        [ChatCommand("skins")]
        private void CmdOpenShop(BasePlayer player, string cmd, string[] args)
        {
            _currentCategory[player.userID] = 0;
            RenderShopUI(player, 0);
        }

        [ConsoleCommand("skindrop.shop")]
        private void CmdShop(ConsoleSystem.Arg args)
        {
            var player = args.Player();
            if (player == null) return;
            if (!args.HasArgs(2)) { RenderShopUI(player, 0); return; }
            if (args.Args[0] != "page") { RenderShopUI(player, 0); return; }
            int page;
            if (!int.TryParse(args.Args[1], out page)) page = 0;
            RenderShopUI(player, Math.Max(0, page));
        }

        [ConsoleCommand("skindrop.buy")]
        private void CmdBuy(ConsoleSystem.Arg args)
        {
            var player = args.Player();
            if (player == null) return;
            if (!args.HasArgs(1)) return;
            int index;
            if (!int.TryParse(args.Args[0], out index)) return;
            var list = GetActiveItems(player);
            if (list == null) return;
            var item = list.ElementAtOrDefault(index);
            if (item == null) return;

            // Проверка экономики
            if (TPEconomic == null)
            {
                SendReply(player, "Экономика не подключена (нет TPEconomic). Покупка невозможна.");
                return;
            }

            float balance = 0f;
            try
            {
                var bal = TPEconomic.Call("API_GET_BALANCE", (ulong)player.userID);
                if (bal is float) balance = (float)bal;
                else if (bal is double) balance = (float)(double)bal;
                else if (bal is int) balance = (int)bal;
            }
            catch { balance = 0f; }

            var price = item.Price;
            // Проверка остатка (если ограничен)
            if (item.Quantity == 0)
            {
                SendReply(player, "Товар распродан.");
                return;
            }
            if (balance < price)
            {
                SendReply(player, "Недостаточно средств.");
                return;
            }

            // Предмет НЕ выдаём сразу — оформление обмена ботом в течение 15 минут
            if (string.IsNullOrEmpty(item.ShortName))
            {
                SendReply(player, "Неверно настроен товар.");
                return;
            }

            // Уведомление о покупке, списать баланс и обновить UI баланса
            var nextRemaining = item.Quantity > 0 ? Math.Max(0, item.Quantity - 1) : item.Quantity;
            AlertUIBuy(player, player.displayName, item.ShortName, item.SkinID, nextRemaining);
            TPEconomic.Call("API_PUT_BALANCE_MINUS", (ulong)player.userID, (float)price);
            TPMenuSystem?.Call("UpdateUIBalance", player);
            // Красивые оповещения в чат для игрока
            player.ChatMessage("<color=#DC143C><size=16><b>SKIN DROP — Покупка оформлена</b></size></color>");
            player.ChatMessage($"Вы приобрели <color=#FFD700>{item.SkinName}</color>. В течение <color=#00FF00>15 минут</color> бот отправит вам обмен в Steam.");
            var hasTrade = UrlTrade.ContainsKey(player.userID) && !string.IsNullOrEmpty(UrlTrade[player.userID]);
            if (!hasTrade)
                player.ChatMessage("<color=#87CEFA>Важно:</color> укажите свою трейд-ссылку в меню <color=#00FFFF>/menu → SKINDROP</color>, иначе бот не сможет отправить скин.");
            else
                player.ChatMessage("<color=#87CEFA>Проверьте входящие предложения обмена в Steam.</color>");

            // Запись в историю как "покупка", чтобы показалось в правом списке на главной
            var now = DateTime.Now;
            DB.Add(new Drop
            {
                DisplayName = player.displayName,
                ShortName = item.ShortName,
                SkinName = item.SkinName,
                SkinID = item.SkinID,
                Url = null,
                Price = item.Price,
                TimeDate = $"{now.ToShortTimeString()} {now:dd.MM.yy}",
                Purchased = true
            });
            SaveDataBase();

            // Отправка задачи боту на обмен
            TrySendToSteamBot(player, item.ShortName, item.SkinID, Math.Max(1, item.GiveCount));

            // Discord-уведомление о покупке (детальное логирование)
            int catIdx = 0; _currentCategory.TryGetValue(player.userID, out catIdx);
            var catNames = GetCategoryNames();
            string categoryName = (catIdx >= 0 && catIdx < catNames.Count) ? catNames[catIdx] : "Unknown";
            var buyFields = Shop_BuyPlayer(player, item, balance, balance - price, categoryName, nextRemaining);
            var author = new Authors(config.AuthorName ?? "SkinDrop Shop", "", config.IconURL ?? "", "");
            // Превью: мастерская по SkinID
            SendDiscord(config.WebhookShopNotify, buyFields, author, new Thumbnail($"https://steamcommunity.com/sharedfiles/filedetails/?id={item.SkinID}"), config.Color);
            // Уменьшаем остаток, если ограничен
            if (item.Quantity > 0)
            {
                item.Quantity = Math.Max(0, item.Quantity - 1);
                SaveConfig();
            }
            RenderShopUI(player, 0);
        }

        private void RenderShopUI(BasePlayer player, int page)
        {
            CuiHelper.DestroyUi(player, ShopRoot);
            CuiHelper.DestroyUi(player, "skindrop.Main");
            if (!HasAnyItems())
            {
                SendReply(player, "Магазин пуст.");
                return;
            }

            var container = new CuiElementContainer();
            // Фон, как в TPBaraxolka (BACKGROUND_BUY)
            container.Add(new CuiElement
            {
                Name = ShopRoot,
                Parent = ".Mains",
                Components =
                {
                    new CuiRawImageComponent { Png = _shopImageUI?.GetImage("BACKGROUND_BUY") },
                    new CuiRectTransformComponent { AnchorMin = "-0.315 -0.27", AnchorMax = "1.3 1.275" }
                }
            });

            // Внутренняя область .R как в TPBaraxolka (контентная рамка)
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.25 0.2", AnchorMax = "0.754 0.64" },
                Image = { Color = "1 1 1 0" }
            }, ShopRoot, ShopRoot + ".R");

            // Область с товарами (внутри .R)
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "-0.01 0.015", AnchorMax = "1.005 1" },
                Image = { Color = "1 1 1 0" }
            }, ShopRoot + ".R", ShopRoot + ".Bottle");

            // Стрелка следующая страница (как в TPBaraxolka)
            var items = GetActiveItems(player).Skip(page * 12).Take(12).ToList();
            // Баланс игрока для окраски кнопок как в TPBaraxolka
            float amountBalance = 0f;
            if (TPEconomic != null)
            {
                try
                {
                    var bal = TPEconomic.Call("API_GET_BALANCE", (ulong)player.userID);
                    if (bal is float) amountBalance = (float)bal;
                    else if (bal is double) amountBalance = (float)(double)bal;
                    else if (bal is int) amountBalance = (int)bal;
                }
                catch { amountBalance = 0f; }
            }
            if (GetActiveItems(player).Count > (page + 1) * 12)
            {
                container.Add(new CuiButton
                {
                    Button = { Command = $"skindrop.shop page {page + 1}", Color = "0 0 0 0" },
                    Text = { Text = "▶", FontSize = 60, Align = TextAnchor.MiddleRight, Color = "0.929 0.882 0.847 0.7" },
                    RectTransform = { AnchorMin = "0.89 -0.15", AnchorMax = "0.99 0" }
                }, ShopRoot + ".Bottle");
            }

            // Сетка 3x4 как в TPBaraxolka
            float x = 0f;
            float y = -0.01f;
            int i = 0;
            for (int idx = 0; idx < items.Count; idx++)
            {
                if ((i % 3) == 0 && i != 0)
                {
                    x = 0f;
                    y += 0.259f;
                }

                var globalIndex = page * 12 + idx;
                var panelName = ShopRoot + $".Shop.{i}";
                var shopItem = items[idx];

                container.Add(new CuiPanel
                {
                    RectTransform = { AnchorMin = $"{0 + x} {0.77f - y}", AnchorMax = $"{0.32f + x} {1 - y}" },
                    Image = { Color = "1 1 1 0" }
                }, ShopRoot + ".Bottle", panelName);

                // Левая область с изображением
                container.Add(new CuiPanel
                {
                    RectTransform = { AnchorMin = "0 0", AnchorMax = "0.36 1" },
                    Image = { Color = "0 0 0 0" }
                }, panelName);

                var def = ItemManager.FindItemDefinition(shopItem.ShortName);
                if (def != null)
                {
                    container.Add(new CuiElement
                    {
                        Parent = panelName,
                        Components =
                        {
                            new CuiImageComponent { ItemId = def.itemid, SkinId = shopItem.SkinID },
                            new CuiRectTransformComponent { AnchorMin = "0.02 0.12", AnchorMax = "0.32 0.88" }
                        }
                    });
                }
                else
                {
                    // Fallback удалён: работаем только через ShortName + SkinID
                }

                // Заголовок
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0.36 0.7", AnchorMax = "1 1" },
                    Text = { Text = shopItem.SkinName ?? "Скин", Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf", FontSize = 12, Color = "1 1 1 0.6" }
                }, panelName);

                // Цена
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0.43 0.14", AnchorMax = "1 1" },
                    Text = { Text = $"{shopItem.Price} мон.", Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf", FontSize = 12, Color = "0.929 0.882 0.847 0.7" }
                }, panelName);

                // Остаток скрыт по запросу

                // Кнопка купить в позициях как у TPBaraxolka
                var effPrice = shopItem.Price;
                var available = shopItem.Quantity != 0;
                var canBuyBalance = amountBalance >= effPrice;
                var bgColor = (available && canBuyBalance) ? "0.8 0.7 0.741 0" : "0.815 0.776 0.741 0";
                var textColor = (available && canBuyBalance) ? "1 1 1 0.8" : "1 1 1 0.3";
                container.Add(new CuiButton
                {
                    Button = { Color = bgColor, Command = $"skindrop.buy {globalIndex}" },
                    Text = { Text = "Купить", Color = textColor, Font = "robotocondensed-regular.ttf", FontSize = 12, Align = TextAnchor.MiddleCenter },
                    RectTransform = { AnchorMin = "0.72 0.1", AnchorMax = "0.96 0.44" }
                }, panelName);

                // Остаток скрыт

                x += 0.34f;
                i++;
            }

            // Вкладки-кнопки сверху: Rust / CS / Dota
            RenderTabs(container, player);

            CuiHelper.AddUi(player, container);
        }

        private bool HasAnyItems()
        {
            if (config == null) return false;
            return config.Categories != null && config.Categories.Any(c => c?.Items != null && c.Items.Count > 0);
        }

        private List<ShopSkinItem> GetActiveItems(BasePlayer player)
        {
            if (config.Categories != null && config.Categories.Count > 0)
            {
                int idx = 0;
                _currentCategory.TryGetValue(player.userID, out idx);
                idx = Mathf.Clamp(idx, 0, config.Categories.Count - 1);
                return config.Categories[idx].Items ?? new List<ShopSkinItem>();
            }
            return new List<ShopSkinItem>();
        }

        private void RenderTabs(CuiElementContainer container, BasePlayer player)
        {
            var tabs = GetCategoryNames();
            if (tabs.Count == 0) { tabs = new List<string> { "Rust", "CS", "Dota" }; EnsureDefaultCategories(); }

            // Контейнер, как в TPBaraxolka: InitialLayer + ".C" с якорями 0.7 0 — 0.9 1
            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.7 0", AnchorMax = "0.9 1" },
                Image = { Color = "0 0 0 0" }
            }, ShopRoot, ShopRoot + ".C");

            // Три кнопки с точными якорями TPBaraxolka
            var anchors = new (string min, string max)[]
            {
                ("-1.5 0.655", "-1.12 0.695"),  // первая
                ("-1.05 0.655", "-0.85 0.695"), // вторая
                ("-0.78 0.655", "-0.47 0.695")  // третья
            };

            for (int i = 0; i < Math.Min(3, tabs.Count); i++)
            {
                container.Add(new CuiButton
                {
                    RectTransform = { AnchorMin = anchors[i].min, AnchorMax = anchors[i].max },
                    Button = { Command = $"skindrop.tab {i}", Color = "0 0 0 0" },
                    Text = { Text = tabs[i].ToUpper(), Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf", FontSize = 12, Color = "1 1 1 0.6" }
                }, ShopRoot + ".C");
            }
        }

        [ConsoleCommand("skindrop.tab")]
        private void CmdTab(ConsoleSystem.Arg args)
        {
            var player = args.Player();
            if (player == null) return;
            if (!args.HasArgs(1)) return;
            int idx;
            if (!int.TryParse(args.Args[0], out idx)) return;
            _currentCategory[player.userID] = idx;
            RenderShopUI(player, 0);
        }

        private List<string> GetCategoryNames()
        {
            if (config?.Categories == null) return new List<string>();
            return config.Categories.Select(c => string.IsNullOrEmpty(c?.Name) ? "Категория" : c.Name).ToList();
        }

        private void EnsureDefaultCategories()
        {
            if (config.Categories == null || config.Categories.Count == 0)
            {
                config.Categories = new List<ShopCategory>
                {
                    new ShopCategory { Name = "Rust", Items = new List<ShopSkinItem>() },
                    new ShopCategory { Name = "CS", Items = new List<ShopSkinItem>() },
                    new ShopCategory { Name = "Dota", Items = new List<ShopSkinItem>() }
                };
                SaveConfig();
            }
        }

        private void GiveDropUI(BasePlayer player)
        {
            StopCountdown(player);
            CuiHelper.DestroyUi(player, "skindrop.Main");
            var container = new CuiElementContainer();

            container.Add(new CuiElement
            {
                Name = "skindrop.Main",
                Parent = ".Mains",
                Components =
                {
                    new CuiRawImageComponent { Png = _shopImageUI?.GetImage("giveskin") },
                    new CuiRectTransformComponent { AnchorMin = "-0.315 -0.27", AnchorMax = "1.3 1.275" }
                }
            });

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.802 0.806", AnchorMax = "0.815 0.829" }, // обновлено
                Button = { Close = "Menu_UI", Color = "0 0 0 0" },
                Text = { Text = "" }
            }, "skindrop.Main");

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.76 0.804", AnchorMax = "0.8 0.832" },
                Button = { Color = "0 0 0 0", Command = "dropskin back" },
                Text = { Text = "Назад", Color = "1 1 1 0.6", FontSize = 10, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-regular.ttf" }
            }, "skindrop.Main");

            CuiHelper.AddUi(player, container);
        }

        // --------------------------- Обратный отсчёт ---------------------------
        private void StartCountdown(BasePlayer player)
        {
            StopCountdown(player); // на всякий
            _countdownTimers[player.userID] = timer.Every(1f, () =>
            {
                if (player == null || !player.IsConnected) { StopCountdown(player); return; }

                var labelName = "skindrop.CountdownText";
                CuiHelper.DestroyUi(player, labelName);

                string text = FormatCountdown();
                var c = new CuiElementContainer();
                c.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0.75" },
                    Text = { Text = text, Color = "1 1 1 0.95", FontSize = 24, Align = TextAnchor.MiddleCenter, Font = "robotocondensed-bold.ttf" }
                }, "skindrop.CountdownBox", labelName);
                CuiHelper.AddUi(player, c);
            });
        }

        private void StopCountdown(BasePlayer player)
        {
            if (player == null) return;
            Timer t;
            if (_countdownTimers.TryGetValue(player.userID, out t))
            {
                t?.Destroy();
                _countdownTimers.Remove(player.userID);
            }
        }

        private string FormatCountdown()
        {
            if (_nextDrawAtUtc == DateTime.MinValue)
                return "—:—:—";

            var now = DateTime.UtcNow;
            var diff = _nextDrawAtUtc - now;

            if (diff.TotalSeconds <= 0)
                return "Розыгрыш идёт!";

            int h = (int)diff.TotalHours;
            int m = diff.Minutes;
            int s = diff.Seconds;
            return $"{h:00}:{m:00}:{s:00}";
        }

        // --------------------------- Инфо-уведомление ---------------------------
        private Timer _alertTimer;

        private void AlertUI(BasePlayer player, string name = "", string shortname = "", ulong skinid = 0)
        {
            _alertTimer?.Destroy();
            CuiHelper.DestroyUi(player, "alert");
            var container = new CuiElementContainer();

            container.Add(new CuiPanel
            {
                CursorEnabled = false,
                RectTransform = { AnchorMin = "0 0.785", AnchorMax = "0.2 0.885" },
                Image = { Color = "0 0 0 0" }
            }, "Overlay", "alert");

            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.02 0", AnchorMax = "0.3 1" },
                Image = { Color = "0 0 0 0" }
            }, "alert", "Image");

            container.Add(new CuiElement
            {
                Parent = "Image",
                Components =
                {
                    new CuiImageComponent { ItemId = ItemManager.FindItemDefinition(shortname).itemid, SkinId = skinid },
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "4 4", OffsetMax = "-4 -4" }
                }
            });

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.32 0", AnchorMax = "1 1" },
                Button = { Color = "0 0 0 0" },
                Text = { Text = $"<color=#DC143C><size=14><b>SKIN DROP</b></size></color>\nИгрок <color=#DC143C>{name}</color> получил скин", Color = "1 1 1 0.8", FontSize = 12, Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf" }
            }, "alert");

            CuiHelper.AddUi(player, container);
            _alertTimer = timer.In(config.TimeAlert, () =>
            {
                foreach (var target in BasePlayer.activePlayerList)
                    CuiHelper.DestroyUi(target, "alert");
            });
        }

        private void AlertUIBuy(BasePlayer player, string name = "", string shortname = "", ulong skinid = 0, int remaining = -1)
        {
            _alertTimer?.Destroy();
            CuiHelper.DestroyUi(player, "alert");
            var container = new CuiElementContainer();

            container.Add(new CuiPanel
            {
                CursorEnabled = false,
                RectTransform = { AnchorMin = "0 0.785", AnchorMax = "0.2 0.885" },
                Image = { Color = "0 0 0 0" }
            }, "Overlay", "alert");

            container.Add(new CuiPanel
            {
                RectTransform = { AnchorMin = "0.02 0", AnchorMax = "0.3 1" },
                Image = { Color = "0 0 0 0" }
            }, "alert", "Image");

            container.Add(new CuiElement
            {
                Parent = "Image",
                Components =
                {
                    new CuiImageComponent { ItemId = ItemManager.FindItemDefinition(shortname).itemid, SkinId = skinid },
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "4 4", OffsetMax = "-4 -4" }
                }
            });

            var remainingText = remaining >= 0 ? $" (осталось: {remaining})" : string.Empty;
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.32 0", AnchorMax = "1 1" },
                Button = { Color = "0 0 0 0" },
                Text = { Text = $"<color=#DC143C><size=14><b>SKIN DROP</b></size></color>\nИгрок <color=#DC143C>{name}</color> купил скин{remainingText}", Color = "1 1 1 0.8", FontSize = 12, Align = TextAnchor.MiddleLeft, Font = "robotocondensed-regular.ttf" }
            }, "alert");

            CuiHelper.AddUi(player, container);
            _alertTimer = timer.In(config.TimeAlert, () =>
            {
                foreach (var target in BasePlayer.activePlayerList)
                    CuiHelper.DestroyUi(target, "alert");
            });
        }

        // --------------------------- Утилиты и Discord ---------------------------
        private void TrySendToSteamBot(BasePlayer player, string shortName, ulong skinId, int count)
        {
            if (!config.SteamBotEnabled) return;

            // Берём трейд-ссылку, если указана
            UrlTrade.TryGetValue(player.userID, out var tradeUrl);

            if (string.Equals(config.SteamBotTransport, "file", StringComparison.OrdinalIgnoreCase))
            {
                EnqueueBotTask(new BotQueueItem
                {
                    SteamId = player.userID.ToString(),
                    ShortName = shortName,
                    SkinId = skinId,
                    Count = Math.Max(1, count),
                    TradeUrl = tradeUrl ?? string.Empty,
                    Note = "SkinDrop",
                    CreatedAt = DateTime.UtcNow.ToString("o")
                });
                player?.ChatMessage("<color=#87CEFA>Заявка на обмен поставлена в очередь. Бот обработает её в ближайшие минуты.</color>");
                return;
            }

            if (string.IsNullOrWhiteSpace(config.SteamBotUrl)) return;

            bool useApiGet = string.Equals(config.SteamBotTransport, "api", StringComparison.OrdinalIgnoreCase) ||
                              (config.SteamBotUrl.IndexOf("action=enqueue_trade", StringComparison.OrdinalIgnoreCase) >= 0);

            if (useApiGet)
            {
                // Формат вашего API (GET): action=enqueue_trade&steamid=&shortname=&skinid=&count=&tradeurl=&note=
                string sep = config.SteamBotUrl.Contains("?") ? "&" : "?";
                string url = config.SteamBotUrl + sep +
                             $"steamid={player.userID}&shortname={Uri.EscapeDataString(shortName ?? string.Empty)}&skinid={skinId}&count={Math.Max(1,count)}&tradeurl={Uri.EscapeDataString(tradeUrl ?? string.Empty)}&note=SkinDrop";
                try
                {
                    webrequest.Enqueue(
                        url,
                        null,
                        (code, response) =>
                        {
                            if (code != 200 && code != 201)
                            {
                                PrintWarning($"API HTTP {code}: {response}");
                                player?.ChatMessage("<color=#DC143C>Не удалось поставить обмен в очередь через API.</color>");
                            }
                        },
                        this,
                        Core.Libraries.RequestMethod.GET,
                        null,
                        timeout: 10f
                    );
                }
                catch (Exception e)
                {
                    PrintWarning($"SteamBot API error: {e.Message}");
                }
                return;
            }

            // Стандартный JSON POST для кастомного бота
            var payload = new
            {
                steamId = player.userID.ToString(),
                shortName = shortName,
                skinId = skinId,
                count = Math.Max(1, count),
                tradeUrl = tradeUrl ?? string.Empty,
                note = "SkinDrop"
            };

            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };
            if (!string.IsNullOrWhiteSpace(config.SteamBotToken)) headers["Authorization"] = $"Bearer {config.SteamBotToken}";

            try
            {
                webrequest.Enqueue(
                    config.SteamBotUrl,
                    JsonConvert.SerializeObject(payload),
                    (code, response) =>
                    {
                        if (code != 200 && code != 201)
                        {
                            PrintWarning($"SteamBot HTTP {code}: {response}");
                            player?.ChatMessage("<color=#DC143C>Не удалось отправить запрос боту на обмен. Админы уведомлены.</color>");
                        }
                    },
                    this,
                    Core.Libraries.RequestMethod.POST,
                    headers,
                    timeout: 10f
                );
            }
            catch (Exception e)
            {
                PrintWarning($"SteamBot error: {e.Message}");
            }
        }

        public class BotQueueItem
        {
            public string SteamId;
            public string ShortName;
            public ulong SkinId;
            public int Count;
            public string TradeUrl;
            public string Note;
            public string CreatedAt;
        }

        private void EnqueueBotTask(BotQueueItem item)
        {
            try
            {
                var key = config.SteamBotQueueFile;
                List<BotQueueItem> q;
                try { q = Interface.Oxide.DataFileSystem.ReadObject<List<BotQueueItem>>(key) ?? new List<BotQueueItem>(); }
                catch { q = new List<BotQueueItem>(); }
                q.Add(item);
                Interface.Oxide.DataFileSystem.WriteObject(key, q);
            }
            catch (Exception e)
            {
                PrintWarning($"EnqueueBotTask error: {e.Message}");
            }
        }
        private BasePlayer FindBasePlayer(string nameOrUserId)
        {
            nameOrUserId = nameOrUserId.ToLower();
            foreach (var player in BasePlayer.activePlayerList)
                if (player.displayName.ToLower().contains(nameOrUserId) || player.UserIDString == nameOrUserId)
                    return player;
            return null;
        }

        // ↓↓↓ Блок Discord — без изменений ↓↓↓
        private List<Fields> DT_PlayerSendTrade(BasePlayer sender, string trade)
        {
            return new List<Fields>
            {
                new Fields("Информация об отправителе :", "", false),
                new Fields("", "", false),
                new Fields("Ник", $"{sender.displayName}", true),
                new Fields("Steam ID", $"{sender.userID}", true),
                new Fields("Trade ссылка", $"{trade}", true),
            };
        }

        // Красивое уведомление о покупке скина в магазине
        private List<Fields> Shop_BuyPlayer(BasePlayer buyer, ShopSkinItem item, float balanceBefore, float balanceAfter, string categoryName, int remainingAfter)
        {
            var list = new List<Fields>
            {
                new Fields("Покупка скина", "Игрок совершил покупку в магазине", false),
                new Fields("Время", $"{DateTime.Now:dd.MM.yyyy HH:mm:ss}", true),
                new Fields("Игрок", $"[{buyer.displayName}](https://steamcommunity.com/profiles/{buyer.userID}) [{buyer.userID}]", false),
                new Fields("Категория", categoryName, true),
                new Fields("Скин", $"{item.SkinName}", true),
                new Fields("ShortName", $"{item.ShortName}", true),
                new Fields("SkinID", $"{item.SkinID}", true),
                new Fields("Цена", $"{item.Price} мон.", true),
                new Fields("Выдано", $"{Math.Max(1,item.GiveCount)} шт.", true),
                new Fields("Баланс до", balanceBefore.ToString("0.##"), true),
                new Fields("Списано", item.Price.ToString("0.##"), true),
                new Fields("Баланс после", Math.Max(0,balanceAfter).ToString("0.##"), true)
            };
            if (remainingAfter >= 0)
                list.Add(new Fields("Осталось на складе", remainingAfter.ToString(), true));
            string linkText = item.SkinName;
            string linkUrl = $"https://steamcommunity.com/sharedfiles/filedetails/?id={item.SkinID}";
            list.Add(new Fields("Ссылка на скин", $"[{linkText}]({linkUrl})", false));
            return list;
        }

        private List<Fields> Drop_Player(BasePlayer sender, string skinName, string skinUrl, string price)
        {
            return new List<Fields>
            {
                new Fields("Поздравляем!", "С победой в ивенте SkinDrop", false),
                new Fields("Игрок", $"[{sender.displayName}](https://steamcommunity.com/profiles/{sender.userID}) [{sender.userID}]", false),
                new Fields("Вывел скин", $"[{skinName.Replace("%20", "")}]({skinUrl})", true),
                new Fields("Стоимость", $"₽{price}", true),
                new Fields("\u200B", $"Служебная информация", false),
            };
        }

        private void SendDiscord(string webhook, List<Fields> fields, Authors author, Thumbnail thumbnail, int color)
        {
            if (string.IsNullOrWhiteSpace(webhook)) return;
            FancyMessage newMessage = new FancyMessage(null, false, new FancyMessage.Embeds[1] { new FancyMessage.Embeds(null, color, fields, author, thumbnail) });

            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };

            webrequest.Enqueue(
                webhook,
                newMessage.toJSON(),
                (code, response) =>
                {
                    if (code != 200 && code != 204)
                    {
                        if (!string.IsNullOrEmpty(response))
                            PrintWarning($"Discord error {code}: {response}");
                        else
                            PrintWarning($"Discord didn't respond (code {code})");
                    }
                },
                this,
                Core.Libraries.RequestMethod.POST,
                headers,
                timeout: 10f
            );
        }

        public class Fields
        {
            public string name { get; set; }
            public string value { get; set; }
            public bool inline { get; set; }
            public Fields(string name, string value, bool inline) { this.name = name; this.value = value; this.inline = inline; }
        }
        public class Authors
        {
            public string name { get; set; }
            public string url { get; set; }
            public string icon_url { get; set; }
            public string proxy_icon_url { get; set; }
            public Authors(string name, string url, string icon_url, string proxy_icon_url) { this.name = name; this.url = url; this.icon_url = icon_url; this.proxy_icon_url = proxy_icon_url; }
        }
        public class FancyMessage
        {
            public string content { get; set; }
            public bool tts { get; set; }
            public Embeds[] embeds { get; set; }
            public class Embeds
            {
                public string title { get; set; }
                public int color { get; set; }
                public List<Fields> fields { get; set; }
                public Authors author { get; set; }
                public Thumbnail thumbnail { get; set; }
                public Embeds(string title, int color, List<Fields> fields, Authors author, Thumbnail thumbnail){ this.title = title; this.color = color; this.fields = fields; this.author = author; this.thumbnail = thumbnail; }
            }
            public FancyMessage(string content, bool tts, Embeds[] embeds){ this.content = content; this.tts = tts; this.embeds = embeds; }
            public string toJSON() => JsonConvert.SerializeObject(this);
        }
        public class Thumbnail { public string url { get; set; } public Thumbnail(string url){ this.url = url; } }

        private static string GetLocalImageKey(ShopSkinItem item) { return null; }
    }

    // Маленький helper для Random из списков
    static class ListExt
    {
        private static readonly System.Random _rng = new System.Random();
        public static T GetRandom<T>(this IList<T> list) => list.Count == 0 ? default(T) : list[_rng.Next(list.Count)];
    }
}
