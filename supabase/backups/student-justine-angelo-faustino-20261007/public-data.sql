SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict s8jh63RCFoScIElcyJbQM1Vhy5v3tvaj7TMndZYZX5Ae9a4UvrI3IRGhnPD7v3V

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."departments" ("id", "department_code", "department_name", "created_at", "updated_at", "is_active", "brand_name_override", "logo_path", "primary_color", "secondary_color") VALUES
	('986f01e3-953a-44b3-987e-035efb2f6a79', 'CBA', 'College of Business Administration', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true, NULL, NULL, NULL, NULL),
	('ba47a9ff-2bd3-4db4-98a8-265b153a6347', 'CAS', 'College of Arts and Sciences', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true, NULL, NULL, NULL, NULL),
	('df8bcf9c-2f33-4bc1-8ecd-6287bcc4d21a', 'CON', 'College of Nursing', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true, NULL, NULL, NULL, NULL),
	('d47a9f5f-ff34-4806-bfa5-53d072d41377', 'COE', 'College of Engineering', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true, NULL, NULL, NULL, NULL),
	('cb81b0f6-029b-4b93-a423-294fe6c6a17b', 'COED', 'College of Education', '2026-09-16 13:45:59.041239+00', '2026-09-16 13:45:59.041239+00', true, NULL, NULL, NULL, NULL),
	('b0a8b026-575c-4e4a-93bf-83ac51efe431', 'CIHM', 'College of International Hospitality Management Department', '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', true, NULL, NULL, NULL, NULL),
	('f8e395db-392d-4988-af58-7ab7d49865cf', 'COL', 'College of Law', '2026-09-21 15:28:13.723121+00', '2026-09-21 15:28:13.723121+00', true, NULL, NULL, NULL, NULL),
	('d9e98b60-035e-403e-a6ee-48b64e93506a', 'CCS', 'College of Computer Studies', '2026-07-17 12:47:33.344185+00', '2026-10-05 02:22:08.766+00', true, 'Pamantasan ng Lungsod ng Pasig', NULL, '#3f7a44', '#e8f1e6');


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "email", "first_name", "middle_name", "last_name", "profile_picture", "role", "account_status", "department_id", "employee_id", "student_id", "created_at", "updated_at", "name_extension") VALUES
	('34e0cdf3-da8e-432f-9e8e-82eadba8514c', 'dr.maria.santos@plpass.edu.ph', 'Maria', NULL, 'Santos', NULL, 'organizer', 'inactive', NULL, 'O-003', NULL, '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', NULL),
	('cff0ea37-3bdd-4b26-868d-228200088897', 'manuel_sofianicole@plpasig.edu.ph', 'Sofia', NULL, 'Manuel', 'profile-avatars:cff0ea37-3bdd-4b26-868d-228200088897/avatar.png', 'organizer', 'active', NULL, 'O-002', NULL, '2026-09-20 18:00:24.199431+00', '2026-09-23 15:51:35.054+00', NULL),
	('97371250-a495-4fff-a6d9-eab14dcebdd4', 'balbacal_chrishamazel@plpasig.edu.ph', 'Chrisha', '', 'Balbacal', 'profile-avatars:97371250-a495-4fff-a6d9-eab14dcebdd4/avatar.jpg', 'department_admin', 'active', NULL, 'A-001', NULL, '2026-09-20 18:15:41.476636+00', '2026-09-23 17:56:07.347+00', NULL),
	('b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'admin@plpass.edu', 'PLPass', NULL, 'Administrator', 'profile-avatars:b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1/avatar.webp', 'admin', 'active', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'ADMIN-001', NULL, '2026-09-14 02:59:47.070227+00', '2026-09-24 23:09:14.503+00', NULL),
	('6e5d25dd-4acb-4ca3-8d62-43edab324749', 'bautista_allenedward@plpasig.edu.ph', 'Allen Edward', 'Macayanan', 'Bautista', NULL, 'student', 'active', NULL, NULL, '26-01227', '2026-10-07 02:35:18.613945+00', '2026-10-07 02:35:18.613945+00', NULL),
	('a2b2d013-294e-4dec-9953-54170e806f6a', 'borja_mildredbelle@plpasig.edu.ph', 'Mildred Belle', 'Tech', 'Borja', NULL, 'student', 'active', NULL, NULL, '26-01197', '2026-10-07 02:35:19.043679+00', '2026-10-07 02:35:19.043679+00', NULL),
	('d113e0d4-64e2-45a2-a419-0576d0a35af9', 'borromeo_jomar@plpasig.edu.ph', 'Jomar', 'Limpiado', 'Borromeo', NULL, 'student', 'active', NULL, NULL, '26-00604', '2026-10-07 02:35:19.462689+00', '2026-10-07 02:35:19.462689+00', NULL),
	('f5e2b294-6fd4-4a6a-9ba1-a9bfd2072159', 'buenaflor_arissia@plpasig.edu.ph', 'Arissia', 'Agdon', 'Buenaflor', NULL, 'student', 'active', NULL, NULL, '26-01082', '2026-10-07 02:35:19.861998+00', '2026-10-07 02:35:19.861998+00', NULL),
	('5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'faustino_justineangelo@plpasig.edu.ph', 'Justine Angelo', '', 'Faustino', NULL, 'student', 'active', NULL, NULL, '23-00211', '2026-09-21 14:35:30.006425+00', '2026-09-21 14:35:30.006425+00', NULL),
	('6b28610b-4d48-48c7-82af-40557d0368c0', 'abadilla_sofia@plpasig.edu.ph', 'Sofia', 'Precioso', 'Abadilla', NULL, 'student', 'active', NULL, NULL, '26-01231', '2026-10-07 02:35:12.126254+00', '2026-10-07 02:35:12.126254+00', NULL),
	('92e99bd4-1e4d-4e24-9ca5-98e94534f9c7', 'abalos_elijah@plpasig.edu.ph', 'Elijah', 'Cruz', 'Abalos', NULL, 'student', 'active', NULL, NULL, '26-00752', '2026-10-07 02:35:13.214723+00', '2026-10-07 02:35:13.214723+00', NULL),
	('bb42046d-495a-4b7f-95fe-0627b72af878', 'addatu_mariacassandra@plpasig.edu.ph', 'Maria Cassandra', 'Pagalilauan', 'Addatu', NULL, 'student', 'active', NULL, NULL, '26-01291', '2026-10-07 02:35:14.452417+00', '2026-10-07 02:35:14.452417+00', NULL),
	('8f1872df-0743-42b2-abb3-8f67c1ec0d45', 'aguada_nathaniel@plpasig.edu.ph', 'Nathaniel', 'Balderamos', 'Aguada', NULL, 'student', 'active', NULL, NULL, '26-00597', '2026-10-07 02:35:14.953911+00', '2026-10-07 02:35:14.953911+00', NULL),
	('3faa5a8b-2245-4d45-8896-834ee38ee22e', 'aguilar_clarisseanne@plpasig.edu.ph', 'Clarisse Anne', 'Alano', 'Aguilar', NULL, 'student', 'active', NULL, NULL, '26-00924', '2026-10-07 02:35:15.422349+00', '2026-10-07 02:35:15.422349+00', NULL),
	('f3509115-b039-4a28-ad37-fc35e1b93e94', 'ala_lyka@plpasig.edu.ph', 'Lyka', 'Cabadsan', 'Ala', NULL, 'student', 'active', NULL, NULL, '26-00925', '2026-10-07 02:35:15.934354+00', '2026-10-07 02:35:15.934354+00', NULL),
	('42433484-ac7d-4559-bfcd-0cad2d200285', 'almero_mavericjules@plpasig.edu.ph', 'Maveric Jules', 'Dableo', 'Almero', NULL, 'student', 'active', NULL, NULL, '26-00599', '2026-10-07 02:35:16.331502+00', '2026-10-07 02:35:16.331502+00', NULL),
	('d7993839-f3df-4468-8431-4b1cff079a13', 'arellano_danzandrew@plpasig.edu.ph', 'Danz Andrew', 'Borres', 'Arellano', NULL, 'student', 'active', NULL, NULL, '26-00577', '2026-10-07 02:35:16.765948+00', '2026-10-07 02:35:16.765948+00', NULL),
	('23141c28-f12e-4f8d-9b4c-94ffc5cc0427', 'azores_mershel@plpasig.edu.ph', 'Mershel', 'Yap', 'Azores', NULL, 'student', 'active', NULL, NULL, '26-01117', '2026-10-07 02:35:17.166394+00', '2026-10-07 02:35:17.166394+00', NULL),
	('46a0fce6-0197-4857-85c7-1c25366d1f1f', 'balag_jiahheart@plpasig.edu.ph', 'Jiah Heart', 'Flores', 'Balag', NULL, 'student', 'active', NULL, NULL, '26-01208', '2026-10-07 02:35:17.650019+00', '2026-10-07 02:35:17.650019+00', NULL),
	('aa66c537-fade-46e0-97e9-7256ecc56e0b', 'bangero_hannahsyeshaeunice@plpasig.edu.ph', 'Hannah Syesha Eunice', 'Rodriguez', 'Bangero', NULL, 'student', 'active', NULL, NULL, '26-01259', '2026-10-07 02:35:18.150962+00', '2026-10-07 02:35:18.150962+00', NULL),
	('002ed7a8-96ab-4ca5-afaf-fef5932fc6b1', 'castillo_daralen@plpasig.edu.ph', 'Dara Len', 'Bernabe', 'Castillo', NULL, 'student', 'active', NULL, NULL, '26-01253', '2026-10-07 02:35:20.252593+00', '2026-10-07 02:35:20.252593+00', NULL),
	('454bab49-db39-4cf3-8403-0afafb23f02a', 'chua_francheska@plpasig.edu.ph', 'Francheska', 'Lores', 'Chua', NULL, 'student', 'active', NULL, NULL, '26-01187', '2026-10-07 02:35:20.743827+00', '2026-10-07 02:35:20.743827+00', NULL),
	('e11359ea-9f97-4ae0-a393-c2c906edbae3', 'daban_delosreyes@plpasig.edu.ph', 'Delos Reyes', 'Nathalie Grace', 'Daban', NULL, 'student', 'active', NULL, NULL, '26-01255', '2026-10-07 02:35:21.14414+00', '2026-10-07 02:35:21.14414+00', NULL),
	('82a6cbe2-8e24-49c5-a4c8-9976f600374f', 'domingo_genechristianeidrielle@plpasig.edu.ph', 'Gene Christian Eidrielle', 'Mercado', 'Domingo', NULL, 'student', 'active', NULL, NULL, '26-01232', '2026-10-07 02:35:21.54092+00', '2026-10-07 02:35:21.54092+00', NULL),
	('a2fec7fc-a29e-41a2-83b1-2155ab025941', 'garcia_simoneyael@plpasig.edu.ph', 'Simone Yael', 'Ba�ez', 'Garcia', NULL, 'student', 'active', NULL, NULL, '26-01298', '2026-10-07 02:35:22.008933+00', '2026-10-07 02:35:22.008933+00', NULL),
	('32018fbb-0e4e-4ddd-b69b-c8a7bee12bea', 'gonzaga_richmond@plpasig.edu.ph', 'Richmond', 'Sumingcay', 'Gonzaga', NULL, 'student', 'active', NULL, NULL, '26-00993', '2026-10-07 02:35:22.424631+00', '2026-10-07 02:35:22.424631+00', NULL),
	('a21501f4-03d2-4b00-83f7-410c3108b736', 'gonzales_davealdrex@plpasig.edu.ph', 'Dave Aldrex', 'Junsay', 'Gonzales', NULL, 'student', 'active', NULL, NULL, '26-01254', '2026-10-07 02:35:22.826528+00', '2026-10-07 02:35:22.826528+00', NULL),
	('5662c20f-bccb-44cb-9059-ecf4b6dfade3', 'legaspi_antonioronel@plpasig.edu.ph', 'Antonio Ronel', NULL, 'Legaspi', NULL, 'student', 'active', NULL, NULL, '26-01205', '2026-10-07 02:35:23.234527+00', '2026-10-07 02:35:23.234527+00', NULL),
	('c5f98aab-0ff8-4096-b576-6a15b5f2b455', 'magnaye_kinrae@plpasig.edu.ph', 'Kin Rae', 'Villapacibe', 'Magnaye', NULL, 'student', 'active', NULL, NULL, '26-01190', '2026-10-07 02:35:23.644084+00', '2026-10-07 02:35:23.644084+00', NULL),
	('4b9135a2-cedc-4da6-af4c-46391eac7d40', 'marcelo_mieltherese@plpasig.edu.ph', 'Miel Therese', 'Dalmino', 'Marcelo', NULL, 'student', 'active', NULL, NULL, '26-01293', '2026-10-07 02:35:24.459552+00', '2026-10-07 02:35:24.459552+00', NULL),
	('fdce43f4-b30f-4d2e-b2a4-a3894f6f15d3', 'marcelo_catalino@plpasig.edu.ph', 'Catalino', 'Dalmino', 'Marcelo', NULL, 'student', 'active', NULL, NULL, '26-01199', '2026-10-07 02:35:24.869715+00', '2026-10-07 02:35:24.869715+00', NULL),
	('de9138f6-c576-4d2f-aa58-9bd4e9e02b96', 'mendres_jaymarkmiguel@plpasig.edu.ph', 'Jay Mark Miguel', 'Sta Ana', 'Mendres', NULL, 'student', 'active', NULL, NULL, '26-01207', '2026-10-07 02:35:25.26889+00', '2026-10-07 02:35:25.26889+00', NULL),
	('bda9ddc8-043a-43be-8c19-05e64224e187', 'mogol_saniajean@plpasig.edu.ph', 'Sania Jean', 'Osal', 'Mogol', NULL, 'student', 'active', NULL, NULL, '26-01192', '2026-10-07 02:35:25.683133+00', '2026-10-07 02:35:25.683133+00', NULL),
	('a2fd6f8c-176e-41c2-98c1-159323b168f4', 'mupan_jairahmae@plpasig.edu.ph', 'Jairah Mae', 'Frias', 'Mupan', NULL, 'student', 'active', NULL, NULL, '26-01201', '2026-10-07 02:35:26.099694+00', '2026-10-07 02:35:26.099694+00', NULL),
	('9f28093a-c6b9-479e-add0-a90ff7635006', 'pagwagan_miklye@plpasig.edu.ph', 'Miklye', 'Panergo', 'Pagwagan', NULL, 'student', 'active', NULL, NULL, '26-01185', '2026-10-07 02:35:26.517864+00', '2026-10-07 02:35:26.517864+00', NULL),
	('7e41e735-aa4f-4e95-a18e-ab10a449f8eb', 'presto_donjeero@plpasig.edu.ph', 'Don Jeero', 'Mendoza', 'Presto', NULL, 'student', 'active', NULL, NULL, '26-01215', '2026-10-07 02:35:27.342099+00', '2026-10-07 02:35:27.342099+00', NULL),
	('634ba7cf-ddb7-474a-baea-2fe3c405e023', 'quiambao_sophia@plpasig.edu.ph', 'Sophia', 'Perez', 'Quiambao', NULL, 'student', 'active', NULL, NULL, '26-01203', '2026-10-07 02:35:27.760837+00', '2026-10-07 02:35:27.760837+00', NULL),
	('5ad3a140-0973-4892-bba1-c5226492c4eb', 'salon_samuel@plpasig.edu.ph', 'Samuel', 'Torrecampo', 'Salon', NULL, 'student', 'active', NULL, NULL, '26-01191', '2026-10-07 02:35:28.161539+00', '2026-10-07 02:35:28.161539+00', NULL),
	('c3131ad5-d659-47f1-9563-db2a858cc34e', 'santos_joyceann@plpasig.edu.ph', 'Joyce Ann', 'Ramos', 'Santos', NULL, 'student', 'active', NULL, NULL, '26-01295', '2026-10-07 02:35:28.563228+00', '2026-10-07 02:35:28.563228+00', NULL),
	('94ba54d4-4d0f-4d39-b166-c83c1ae084af', 'sumulong_maryjoyce@plpasig.edu.ph', 'Mary Joyce', 'Navarro', 'Sumulong', NULL, 'student', 'active', NULL, NULL, '26-01189', '2026-10-07 02:35:28.969885+00', '2026-10-07 02:35:28.969885+00', NULL),
	('7612e938-015d-45c1-8b00-453ed3b5a018', 'verdida_marvhic@plpasig.edu.ph', 'Marvhic', 'Artes', 'Verdida', NULL, 'student', 'active', NULL, NULL, '26-01202', '2026-10-07 02:35:29.393761+00', '2026-10-07 02:35:29.393761+00', NULL),
	('7861e38c-7c97-4289-b684-e549defb887a', 'villanueva_johnrylie@plpasig.edu.ph', 'John Rylie', 'Medina', 'Villanueva', NULL, 'student', 'active', NULL, NULL, '26-00148', '2026-10-07 02:35:29.801113+00', '2026-10-07 02:35:29.801113+00', NULL),
	('224ad683-6f5f-4ac2-9a46-9b380abc9b9f', 'zausa_clianrizisan@plpasig.edu.ph', 'Clianrizisan', 'Saludes', 'Zausa', NULL, 'student', 'active', NULL, NULL, '26-01216', '2026-10-07 02:35:30.188679+00', '2026-10-07 02:35:30.188679+00', NULL),
	('3438496b-2569-459f-ab01-d1936cfde80c', 'cabaloan_terrenz@plpasig.edu.ph', 'Terrenz', 'Elaco', 'Cabaloan', NULL, 'student', 'active', NULL, NULL, '26-00619', '2026-10-07 03:20:36.962286+00', '2026-10-07 03:20:36.962286+00', NULL),
	('87df5347-2588-4df6-ba96-3bcbb59b244a', 'pena_robandrei@plpasig.edu.ph', 'Rob Andrei', 'Montermoso', 'Pena', NULL, 'student', 'active', NULL, NULL, '26-01195', '2026-10-07 02:35:26.909693+00', '2026-10-07 02:35:26.909693+00', NULL),
	('e995fa4a-b8b7-4cf9-9d0d-db7fe60560d3', 'june.peralta@plpass.edu.ph', 'June', NULL, 'Peralta', NULL, 'organizer', 'active', NULL, 'O-004', NULL, '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', NULL),
	('58e32987-9756-4b25-9353-bbff1980410e', 'calza_rheycilmae@plpasig.edu.ph', 'Rheycil Mae', 'Sostino', 'Calza', NULL, 'student', 'active', NULL, NULL, '26-01222', '2026-10-07 03:20:37.766127+00', '2026-10-07 03:20:37.766127+00', NULL),
	('d2d7b136-a95b-4e7b-ba9d-3640b81c7232', 'dago_lebronandrei@plpasig.edu.ph', 'Lebron Andrei', 'Baluran', 'Dago', NULL, 'student', 'active', NULL, NULL, '26-01118', '2026-10-07 03:20:40.66892+00', '2026-10-07 03:20:40.66892+00', NULL),
	('2df86b71-eafa-4243-80cf-5f70f5ad0838', 'domingo_judekhaled@plpasig.edu.ph', 'Jude Khaled', 'Mendiola', 'Domingo', NULL, 'student', 'active', NULL, NULL, '26-01090', '2026-10-07 03:20:43.181763+00', '2026-10-07 03:20:43.181763+00', NULL),
	('65a6ad20-9692-4a88-941d-d15715b43fa2', 'fuentes_brentlloyd@plpasig.edu.ph', 'Brent Lloyd', 'Pinalba', 'Fuentes', NULL, 'student', 'active', NULL, NULL, '26-00662', '2026-10-07 03:20:45.675974+00', '2026-10-07 03:20:45.675974+00', NULL),
	('eb13dc10-d11c-486d-8035-8ecc0d85cb50', 'gutierrez_twingkejoy@plpasig.edu.ph', 'Twingke Joy', 'Balicastro', 'Gutierrez', NULL, 'student', 'active', NULL, NULL, '26-00680', '2026-10-07 03:20:48.199348+00', '2026-10-07 03:20:48.199348+00', NULL),
	('026c85d0-0b16-49d4-87ad-dd66a095b264', 'leones_johnmartin@plpasig.edu.ph', 'John Martin', 'Go', 'Leones', NULL, 'student', 'active', NULL, NULL, '26-00693', '2026-10-07 03:20:50.561217+00', '2026-10-07 03:20:50.561217+00', NULL),
	('3799e3b2-4fef-4b00-aebb-6309fceca159', 'manuel_liankench@plpasig.edu.ph', 'Lian Kench', 'Bernales', 'Manuel', NULL, 'student', 'active', NULL, NULL, '26-01260', '2026-10-07 03:20:52.901722+00', '2026-10-07 03:20:52.901722+00', NULL),
	('fa017f0c-e797-4ef8-87f7-d7ec99779f5a', 'cardona_nessierose@plpasig.edu.ph', 'Nessie Rose', 'Dela Cruz', 'Cardona', NULL, 'student', 'active', NULL, NULL, '26-00623', '2026-10-07 03:20:38.387686+00', '2026-10-07 03:20:38.387686+00', NULL),
	('519b8d95-a005-4b98-8b4e-146cb3dd2fb2', 'castro_jhonrex@plpasig.edu.ph', 'Jhon Rex', 'Colico', 'Castro', NULL, 'student', 'active', NULL, NULL, '26-01272', '2026-10-07 03:20:38.861514+00', '2026-10-07 03:20:38.861514+00', NULL),
	('8543d44d-ae42-4788-8e5f-072e70479e99', 'cereza_christal@plpasig.edu.ph', 'Christal', 'Bia', 'Cereza', NULL, 'student', 'active', NULL, NULL, '26-01218', '2026-10-07 03:20:39.333751+00', '2026-10-07 03:20:39.333751+00', NULL),
	('8b37dd34-c086-4735-ba9d-0778baab0f1e', 'cuabo_ryan@plpasig.edu.ph', 'Ryan', 'Banlao', 'Cuabo', NULL, 'student', 'active', NULL, NULL, '26-00617', '2026-10-07 03:20:40.22403+00', '2026-10-07 03:20:40.22403+00', NULL),
	('5cfc447b-f5c3-4efe-8d77-60b6fc19a4c6', 'deocampo_yiajuliana@plpasig.edu.ph', 'Yia Juliana', 'Mandalejo', 'De Ocampo', NULL, 'student', 'active', NULL, NULL, '26-00644', '2026-10-07 03:20:41.043201+00', '2026-10-07 03:20:41.043201+00', NULL),
	('c1978c2a-3c4b-4699-9b40-84b54b6985c2', 'delacruz_kateanson@plpasig.edu.ph', 'Kate Anson', 'Prado', 'Dela Cruz', NULL, 'student', 'active', NULL, NULL, '26-00647', '2026-10-07 03:20:41.518034+00', '2026-10-07 03:20:41.518034+00', NULL),
	('bc425ab6-0381-49bc-914a-fc12d1a6ac83', 'delacruz_faith@plpasig.edu.ph', 'Faith', 'Balayan', 'Dela Cruz', NULL, 'student', 'active', NULL, NULL, '26-01269', '2026-10-07 03:20:41.939939+00', '2026-10-07 03:20:41.939939+00', NULL),
	('d358c733-f2b0-4b3e-a703-c0f81f381b1a', 'delacruz_althea@plpasig.edu.ph', 'Althea', 'Dela Pe�a', 'Dela Cruz', NULL, 'student', 'active', NULL, NULL, '26-01088', '2026-10-07 03:20:42.337023+00', '2026-10-07 03:20:42.337023+00', NULL),
	('7659f51f-4bba-4317-b0bd-17ac8cd78ad9', 'delgado_kryshellekae@plpasig.edu.ph', 'Kryshelle Kae', 'Garinggan', 'Delgado', NULL, 'student', 'active', NULL, NULL, '26-00645', '2026-10-07 03:20:42.725964+00', '2026-10-07 03:20:42.725964+00', NULL),
	('b08dd6a8-6d76-41a1-98f8-872ccc1ddae7', 'erguero_cynjie@plpasig.edu.ph', 'Cynjie', 'Recodig', 'Erguero', NULL, 'student', 'active', NULL, NULL, '26-01188', '2026-10-07 03:20:44.048207+00', '2026-10-07 03:20:44.048207+00', NULL),
	('48a87201-8472-4d1c-8a24-c7f67ed2d76d', 'espinosa_princemichael@plpasig.edu.ph', 'Prince Michael', 'Perez', 'Espinosa', NULL, 'student', 'active', NULL, NULL, '26-00712', '2026-10-07 03:20:44.464178+00', '2026-10-07 03:20:44.464178+00', NULL),
	('8a35700e-a311-4e3e-bdbc-a35fe3dd7e2a', 'espiritu_angelakhate@plpasig.edu.ph', 'Angela Khate', NULL, 'Espiritu', NULL, 'student', 'active', NULL, NULL, '26-00653', '2026-10-07 03:20:44.858952+00', '2026-10-07 03:20:44.858952+00', NULL),
	('a054dfd8-50f3-4d72-861f-db18783895ba', 'fabricante_kristalmae@plpasig.edu.ph', 'Kristal Mae', 'Panganiban', 'Fabricante', NULL, 'student', 'active', NULL, NULL, '26-01262', '2026-10-07 03:20:45.274395+00', '2026-10-07 03:20:45.274395+00', NULL),
	('12ecfbb5-370b-4baa-afbc-0bb432e5ccb1', 'galeon_maxinerowie@plpasig.edu.ph', 'Maxine Rowie', 'Cutamora', 'Galeon', NULL, 'student', 'active', NULL, NULL, '26-00665', '2026-10-07 03:20:46.07538+00', '2026-10-07 03:20:46.07538+00', NULL),
	('4eda7033-e634-4401-aeee-f705ec6502e0', 'gano_angelmarie@plpasig.edu.ph', 'Angel Marie', 'Borromeo', 'Gano', NULL, 'student', 'active', NULL, NULL, '26-00682', '2026-10-07 03:20:46.555693+00', '2026-10-07 03:20:46.555693+00', NULL),
	('65b4c3df-dbcd-49ee-9285-28cffe6a5b2d', 'gimotea_diammenicole@plpasig.edu.ph', 'Diamme Nicole', 'Grullo', 'Gimotea', NULL, 'student', 'active', NULL, NULL, '26-01214', '2026-10-07 03:20:46.95001+00', '2026-10-07 03:20:46.95001+00', NULL),
	('a7037b76-16fe-4a81-ba0b-6a70650c91a5', 'gonsales_eloisa@plpasig.edu.ph', 'Eloisa', 'Alog', 'Gonsales', NULL, 'student', 'active', NULL, NULL, '26-01265', '2026-10-07 03:20:47.34378+00', '2026-10-07 03:20:47.34378+00', NULL),
	('8c80f94b-501c-4ac8-b22a-754965c32230', 'gutierrez_maryjoy@plpasig.edu.ph', 'Mary Joy', 'Eliang', 'Gutierrez', NULL, 'student', 'active', NULL, NULL, '26-00674', '2026-10-07 03:20:47.737361+00', '2026-10-07 03:20:47.737361+00', NULL),
	('eff604aa-36df-442a-be05-512579eb5943', 'hizon_robandrew@plpasig.edu.ph', 'Rob Andrew', 'Pe�a', 'Hizon', NULL, 'student', 'active', NULL, NULL, '26-01200', '2026-10-07 03:20:48.578975+00', '2026-10-07 03:20:48.578975+00', NULL),
	('57151be4-3141-4ed6-8f49-a8cb1c5c4893', 'jacobe_xyraroshiel@plpasig.edu.ph', 'Xyra Roshiel', 'Areglado', 'Jacobe', NULL, 'student', 'active', NULL, NULL, '26-01252', '2026-10-07 03:20:48.977911+00', '2026-10-07 03:20:48.977911+00', NULL),
	('ad6db960-607e-4e2f-a326-649031739ace', 'javier_lianlamisse@plpasig.edu.ph', 'Lian Lamisse', 'Sanchez', 'Javier', NULL, 'student', 'active', NULL, NULL, '26-01258', '2026-10-07 03:20:49.375323+00', '2026-10-07 03:20:49.375323+00', NULL),
	('46f59be4-8fa3-40a6-8d44-83418e39df11', 'kilakiga_lyka@plpasig.edu.ph', 'Lyka', 'Ja-Os', 'Kilakiga', NULL, 'student', 'active', NULL, NULL, '26-00686', '2026-10-07 03:20:49.777562+00', '2026-10-07 03:20:49.777562+00', NULL),
	('57ee444e-43e8-4f87-8c90-f963254b5d31', 'langcauon_sabrina@plpasig.edu.ph', 'Sabrina', NULL, 'Langcauon', NULL, 'student', 'active', NULL, NULL, '26-00691', '2026-10-07 03:20:50.172074+00', '2026-10-07 03:20:50.172074+00', NULL),
	('7af364f9-c152-4b01-a79f-fc412c7f19fe', 'licuanan_lyranicole@plpasig.edu.ph', 'Lyra Nicole', 'Amar', 'Licuanan', NULL, 'student', 'active', NULL, NULL, '26-01196', '2026-10-07 03:20:50.954305+00', '2026-10-07 03:20:50.954305+00', NULL),
	('c88bd0a0-330a-4476-b079-2ead88f9a9a5', 'lipana_francheskamarie@plpasig.edu.ph', 'Francheska Marie', 'Vidal', 'Lipana', NULL, 'student', 'active', NULL, NULL, '26-00689', '2026-10-07 03:20:51.361922+00', '2026-10-07 03:20:51.361922+00', NULL),
	('7c8163c5-709d-469b-b190-e0ffc12e3dae', 'luisaga_carlvincent@plpasig.edu.ph', 'Carl Vincent', 'Inventor', 'Luisaga', NULL, 'student', 'active', NULL, NULL, '26-00698', '2026-10-07 03:20:51.75662+00', '2026-10-07 03:20:51.75662+00', NULL),
	('6234988a-7fba-4a6f-8e68-24e00b392c63', 'malong_justheryneklein@plpasig.edu.ph', 'Justheryne Klein', NULL, 'Malong', NULL, 'student', 'active', NULL, NULL, '26-00763', '2026-10-07 03:20:52.134128+00', '2026-10-07 03:20:52.134128+00', NULL),
	('3fedde38-9b31-4427-9fbd-4a17a8deac4f', 'manuel_jamirr@plpasig.edu.ph', 'Jamirr', 'Perlas', 'Manuel', NULL, 'student', 'active', NULL, NULL, '26-00700', '2026-10-07 03:20:52.515978+00', '2026-10-07 03:20:52.515978+00', NULL),
	('a129a004-6c54-4e8a-869f-94ac101efac3', 'marbella_ella@plpasig.edu.ph', 'Ella', 'Ballesteros', 'Marbella', NULL, 'student', 'active', NULL, NULL, '26-00707', '2026-10-07 03:20:53.282542+00', '2026-10-07 03:20:53.282542+00', NULL),
	('83d39690-0a87-4d03-85e9-2597aae576ac', 'concepcion_mikeronino@plpasig.edu.ph', 'Mikeronino', 'Pinili', 'Concepcion', NULL, 'student', 'active', NULL, NULL, '26-01257', '2026-10-07 03:20:39.753448+00', '2026-10-07 03:20:39.753448+00', NULL),
	('237f4927-ebfc-485e-8455-e9f9f17ca50e', 'ebona_danielandrew@plpasig.edu.ph', 'Daniel Andrew', 'Caymo', 'Ebona', NULL, 'student', 'active', NULL, NULL, '26-01309', '2026-10-07 03:20:43.566942+00', '2026-10-07 03:20:43.566942+00', NULL),
	('43cd45ee-ee65-4333-b0f3-194163d12abd', 'manosca_driex@plpasig.edu.ph', 'Driex', 'Reynoso', 'Manosca', NULL, 'student', 'active', NULL, NULL, '26-01193', '2026-10-07 02:35:24.056183+00', '2026-10-07 02:35:24.056183+00', NULL),
	('907d6a42-43bd-4c7b-879a-44c67f0a7530', 'organizer@plpass.edu.ph', 'Organizer', 'Good', 'One', 'profile-avatars:907d6a42-43bd-4c7b-879a-44c67f0a7530/avatar.png', 'organizer', 'active', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'O-001', NULL, '2026-07-17 12:47:33.994594+00', '2026-09-14 03:18:29.734496+00', NULL),
	('93d1ce13-0f86-4668-9c35-b7ebe190af62', 'goto_ipei@plpasig.edu.ph', 'Ipei', 'Bajar', 'Goto', NULL, 'department_admin', 'active', NULL, 'A-005', NULL, '2026-10-07 08:14:34.317573+00', '2026-10-07 08:14:34.317573+00', NULL);


--
-- Data for Name: admin_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."admin_profiles" ("id", "profile_id", "department_id", "employee_number", "office_name", "created_at", "updated_at") VALUES
	('13b93bd5-043f-46fe-9ff8-1c08a1cb39dd', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'ADMIN-001', 'PLPass Administration', '2026-09-14 02:59:47.070227+00', '2026-09-14 02:59:47.070227+00'),
	('d8965516-dc1f-4b74-9019-62dcee235b0a', '907d6a42-43bd-4c7b-879a-44c67f0a7530', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'ADMIN-ORGANIZER-001', 'PLPass Administration', '2026-09-14 03:13:47.179054+00', '2026-09-14 03:13:47.179054+00'),
	('c7ca218f-907e-462b-9c34-2f11f730d99d', '97371250-a495-4fff-a6d9-eab14dcebdd4', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'A-001', 'Department Administration', '2026-09-20 18:15:41.605928+00', '2026-09-20 18:15:41.605928+00'),
	('c77aecd6-9cc1-4df9-95ee-2d363fd5ffee', '93d1ce13-0f86-4668-9c35-b7ebe190af62', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'A-005', 'Department Admin', '2026-10-07 08:14:34.513134+00', '2026-10-07 08:14:34.513134+00');


--
-- Data for Name: attendance_late_reason_options; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."attendance_late_reason_options" ("id", "code", "default_label", "sort_order", "is_active", "created_at", "updated_at") VALUES
	('09838e66-5d21-45a2-9a59-e92416c268ff', 'traffic_commute', 'Traffic / Commute', 10, true, '2026-09-07 07:55:24.020531+00', '2026-09-07 07:55:24.020531+00'),
	('ed2a72d3-3b09-4a95-b8ec-c410650591cb', 'class_academic_conflict', 'Class or Academic Conflict', 20, true, '2026-09-07 07:55:24.020531+00', '2026-09-07 07:55:24.020531+00'),
	('50fc7de8-8ec2-4620-b9ec-0cd8e24d562b', 'personal_health', 'Personal / Health', 30, true, '2026-09-07 07:55:24.020531+00', '2026-09-07 07:55:24.020531+00'),
	('b779516d-d742-4e4e-a9e3-4d672d2da06c', 'weather_force_majeure', 'Weather / Force Majeure', 40, true, '2026-09-07 07:55:24.020531+00', '2026-09-07 07:55:24.020531+00'),
	('d44ac4cc-8484-46ce-b7cc-14564b4722d6', 'other', 'Other', 50, true, '2026-09-07 07:55:24.020531+00', '2026-09-07 07:55:24.020531+00');


--
-- Data for Name: attendance_late_reason_option_translations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."event_categories" ("id", "category_name", "created_at", "updated_at", "is_active") VALUES
	('a4c6a70f-de38-48aa-8bf3-66315d9e0410', 'Career Development', '2026-07-17 15:32:31.032724+00', '2026-07-17 15:32:31.032724+00', true),
	('b9f56565-903c-42e9-8a78-2869699d73d9', 'Skills Training', '2026-07-17 15:32:31.271625+00', '2026-07-17 15:32:31.271625+00', true),
	('9c168c4b-08b1-446a-b2da-0b248afcc50f', 'General Assembly', '2026-07-17 15:32:31.491124+00', '2026-07-17 15:32:31.491124+00', true),
	('227e8e61-87b6-4794-b7e1-fa4b254c84c3', 'Seminar', '2026-07-17 15:32:31.701415+00', '2026-07-17 15:32:31.701415+00', true),
	('99f8a7b2-8d6d-4df2-9d37-8630ee2be29e', 'Competition', '2026-07-17 15:32:31.893845+00', '2026-07-17 15:32:31.893845+00', true),
	('2a71df18-8ff7-447c-a6f2-a1da2e98231a', 'Student Side Testing', '2026-08-09 10:08:29.654122+00', '2026-08-09 10:08:29.654122+00', true),
	('983f7ec2-5026-4b15-ac61-9402ddf1203a', 'Assembly', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('73e88b45-7129-482a-9237-2fa10569c2ae', 'Workshop', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('a82f3e52-60ba-4507-9ebb-692d3f49aa92', 'Orientation', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('68ecaf6b-7b94-4a40-ad09-c66412400e12', 'Training', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('f2e648b1-2ad8-4fe2-9ed1-cb854d546c62', 'Athletic Event', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('50eb3e7d-2630-48f3-949b-b14b5b4a1b54', 'Ceremony', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('26935933-4fbe-491d-8d5c-29e95858a68f', 'Rehearsal/Practice', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('4fb3f1e5-3c0c-4a15-9dd3-a03177bfa39f', 'Cultural Program', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('522a5c71-ed60-4e1e-afac-af8fced7af8e', 'Election Activity', '2026-08-28 14:02:29.698921+00', '2026-08-28 14:02:29.698921+00', true),
	('9f7bf07e-0bae-4746-8424-d78b1475c05b', 'Class', '2026-09-18 09:03:21.87782+00', '2026-09-18 09:03:21.87782+00', true);


--
-- Data for Name: organizers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organizers" ("id", "profile_id", "employee_id", "department_id", "organization_name", "position", "organizer_status", "created_at", "updated_at", "college_logo_path") VALUES
	('90aaac37-9505-4e0d-8fe4-c4cd0f1f1ae8', 'cff0ea37-3bdd-4b26-868d-228200088897', 'O-002', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'Pamantasan ng Lungsod ng Pasig', 'Organizer', 'active', '2026-09-20 18:00:24.442712+00', '2026-09-20 18:00:24.442712+00', NULL),
	('08266c07-f1c8-49fd-bc6d-0193b0da9335', '34e0cdf3-da8e-432f-9e8e-82eadba8514c', 'O-003', NULL, 'Hospitality Management Dept', 'Department Head', 'active', '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', NULL),
	('98634940-1cb0-44a6-a83e-608b50babc57', 'e995fa4a-b8b7-4cf9-9d0d-db7fe60560d3', 'O-004', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'College of International Hospitality Management Department', 'Professor', 'active', '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', NULL),
	('885ee6a3-479b-474c-a8bc-e3649d5a04d8', '907d6a42-43bd-4c7b-879a-44c67f0a7530', 'O-001', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'Pamantasan ng Lungsod ng Pasig', 'Events Coordinator', 'active', '2026-07-17 12:47:34.412922+00', '2026-07-17 12:47:34.412922+00', NULL);


--
-- Data for Name: events; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: programs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."programs" ("id", "department_id", "program_code", "program_name", "created_at", "updated_at", "is_active") VALUES
	('7837394a-2bb2-4571-9f40-46d9d7675c43', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'BSCS', 'Bachelor of Science in Computer Science', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true),
	('c89b92df-cc96-4c50-b153-1ce1cea5c4d5', 'd47a9f5f-ff34-4806-bfa5-53d072d41377', 'BSECE', 'Bachelor of Science in Electronics Engineering', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true),
	('4c613afc-e5f0-462f-a512-9f9ad2b8c574', '986f01e3-953a-44b3-987e-035efb2f6a79', 'BSBA-FM', 'Bachelor of Science in Business Administration major in Financial Management', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true),
	('fb42ea24-883e-43e0-81cb-0d622ed94ec3', 'ba47a9ff-2bd3-4db4-98a8-265b153a6347', 'BSPsych', 'Bachelor of Science in Psychology', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true),
	('0d5c79a5-d3f6-4350-a8a5-63fedc268b2b', 'df8bcf9c-2f33-4bc1-8ecd-6287bcc4d21a', 'BSN', 'Bachelor of Science in Nursing', '2026-08-10 04:47:56.070932+00', '2026-08-10 04:47:56.070932+00', true),
	('aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'BSHM', 'Bachelor of Science in Hospitality Management', '2026-09-18 09:13:59.372633+00', '2026-09-18 09:13:59.372633+00', true),
	('bdb24704-ec6a-4edf-8590-80566543af91', 'd9e98b60-035e-403e-a6ee-48b64e93506a', 'BSIT', 'Bachelor of Science in Information Technology', '2026-07-17 12:47:33.574426+00', '2026-07-17 12:47:33.574426+00', true);


--
-- Data for Name: sections; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."sections" ("id", "program_id", "section_name", "year_level", "academic_year", "semester", "created_at", "updated_at", "is_active") VALUES
	('8c3e04d9-bf56-457d-8806-1b193aa0d3c9', 'bdb24704-ec6a-4edf-8590-80566543af91', 'D', 4, '2026-2027', '1st Semester', '2026-09-07 07:34:05.099203+00', '2026-09-07 07:34:05.099203+00', true),
	('ed5c793b-bb68-4113-9aab-b52f8098c3f7', 'bdb24704-ec6a-4edf-8590-80566543af91', 'A', 4, '2026-2027', '', '2026-09-21 15:49:31.744978+00', '2026-09-21 15:49:31.744978+00', true),
	('a1d00485-bc7d-4e6b-97b6-d846f9c68236', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'A', 1, '2026-2027', '823dd835-8f08-4f98-a167-e5a4026e6440', '2026-10-07 02:35:12.59164+00', '2026-10-07 02:35:12.59164+00', true),
	('b0892616-bd31-419f-93f5-6eb4611f54bf', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'B', 1, '2026-2027', '823dd835-8f08-4f98-a167-e5a4026e6440', '2026-10-07 03:20:37.299397+00', '2026-10-07 03:20:37.299397+00', true),
	('515af8e1-dfd2-4d7a-a547-41133f8813d9', '7837394a-2bb2-4571-9f40-46d9d7675c43', 'A', 4, '2026-2027', '1st Semester', '2026-09-16 08:05:44.973889+00', '2026-09-16 08:05:44.973889+00', true);


--
-- Data for Name: students; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."students" ("id", "profile_id", "student_id", "program_id", "department_id", "section_id", "year_level", "student_status", "created_at", "updated_at", "initial_facial_enrollment_completed_at") VALUES
	('b821d5f7-569f-409b-80fe-0acb67bb2274', '026c85d0-0b16-49d4-87ad-dd66a095b264', '26-00693', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:50.66347+00', '2026-10-07 03:20:50.66347+00', NULL),
	('9db598d4-c180-40f9-ad53-140ab7855d79', 'c88bd0a0-330a-4476-b079-2ead88f9a9a5', '26-00689', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:51.470466+00', '2026-10-07 03:20:51.470466+00', NULL),
	('b1ef5aeb-c79a-495a-8975-a08ca1faf720', '6234988a-7fba-4a6f-8e68-24e00b392c63', '26-00763', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:52.236823+00', '2026-10-07 03:20:52.236823+00', NULL),
	('79c46da3-0a01-4c5d-a848-631ea8850b04', '3799e3b2-4fef-4b00-aebb-6309fceca159', '26-01260', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:53.003863+00', '2026-10-07 03:20:53.003863+00', NULL),
	('4a11c534-a3a5-4d6f-8d69-212961799a2f', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', '23-00211', 'bdb24704-ec6a-4edf-8590-80566543af91', 'd9e98b60-035e-403e-a6ee-48b64e93506a', '8c3e04d9-bf56-457d-8806-1b193aa0d3c9', 4, 'enrolled', '2026-09-21 14:35:30.175783+00', '2026-09-21 14:35:30.175783+00', NULL),
	('aad11284-90b9-400f-90fc-bbf72e9d933e', '6b28610b-4d48-48c7-82af-40557d0368c0', '26-01231', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:12.729014+00', '2026-10-07 02:35:12.729014+00', NULL),
	('251f8c01-b1b2-4c4d-952e-8ece5ef3e8c1', 'bb42046d-495a-4b7f-95fe-0627b72af878', '26-01291', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:14.596844+00', '2026-10-07 02:35:14.596844+00', NULL),
	('92548b77-eab1-46fe-9fac-e5fa4de95cda', '8f1872df-0743-42b2-abb3-8f67c1ec0d45', '26-00597', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:15.135007+00', '2026-10-07 02:35:15.135007+00', NULL),
	('47cbda40-8699-4489-87a7-c25e53bc4826', 'f3509115-b039-4a28-ad37-fc35e1b93e94', '26-00925', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:16.041917+00', '2026-10-07 02:35:16.041917+00', NULL),
	('32648e81-4c6e-4bcc-b1f3-624075d83081', '42433484-ac7d-4559-bfcd-0cad2d200285', '26-00599', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:16.444805+00', '2026-10-07 02:35:16.444805+00', NULL),
	('84e0a415-cdfe-49bf-8306-6fd8c0af71f2', '23141c28-f12e-4f8d-9b4c-94ffc5cc0427', '26-01117', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:17.275515+00', '2026-10-07 02:35:17.275515+00', NULL),
	('c906cad5-a755-45ec-8070-f612aca4b186', '46a0fce6-0197-4857-85c7-1c25366d1f1f', '26-01208', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:17.846375+00', '2026-10-07 02:35:17.846375+00', NULL),
	('57e136b5-5d39-49ec-b782-74ff31380685', '6e5d25dd-4acb-4ca3-8d62-43edab324749', '26-01227', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:18.722557+00', '2026-10-07 02:35:18.722557+00', NULL),
	('0e13f715-e630-411f-b9fc-c5737f684b7e', 'a2b2d013-294e-4dec-9953-54170e806f6a', '26-01197', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:19.151381+00', '2026-10-07 02:35:19.151381+00', NULL),
	('0eb3c191-c9cc-4c58-9ff0-1349d0220490', 'f5e2b294-6fd4-4a6a-9ba1-a9bfd2072159', '26-01082', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:19.96734+00', '2026-10-07 02:35:19.96734+00', NULL),
	('c1eb24a5-461d-4616-a80b-822e3ebd6df5', '002ed7a8-96ab-4ca5-afaf-fef5932fc6b1', '26-01253', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:20.365648+00', '2026-10-07 02:35:20.365648+00', NULL),
	('0395d233-bea6-435c-8d22-7afec03b5469', 'e11359ea-9f97-4ae0-a393-c2c906edbae3', '26-01255', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:21.246646+00', '2026-10-07 02:35:21.246646+00', NULL),
	('06230bcd-f6a1-457f-aa71-a51db55140b0', '82a6cbe2-8e24-49c5-a4c8-9976f600374f', '26-01232', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:21.640424+00', '2026-10-07 02:35:21.640424+00', NULL),
	('1cf85218-4552-402f-8aab-a5b72c7cba09', '32018fbb-0e4e-4ddd-b69b-c8a7bee12bea', '26-00993', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:22.526191+00', '2026-10-07 02:35:22.526191+00', NULL),
	('72f4803b-0475-4094-8d84-07adbef38dae', 'a21501f4-03d2-4b00-83f7-410c3108b736', '26-01254', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:22.935774+00', '2026-10-07 02:35:22.935774+00', NULL),
	('7b3a7033-d13e-4fa2-8f40-4bdddb27e5f1', 'c5f98aab-0ff8-4096-b576-6a15b5f2b455', '26-01190', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:23.749169+00', '2026-10-07 02:35:23.749169+00', NULL),
	('0bb1949e-d9df-476d-945b-2f55a1ce04a2', 'fdce43f4-b30f-4d2e-b2a4-a3894f6f15d3', '26-01199', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:24.979682+00', '2026-10-07 02:35:24.979682+00', NULL),
	('a97f4db9-0ad8-4a2c-8ed5-65f4c1afc293', 'de9138f6-c576-4d2f-aa58-9bd4e9e02b96', '26-01207', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:25.370558+00', '2026-10-07 02:35:25.370558+00', NULL),
	('1cab51bf-c482-4658-94fa-0d6dd65b5c57', 'a2fd6f8c-176e-41c2-98c1-159323b168f4', '26-01201', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:26.208738+00', '2026-10-07 02:35:26.208738+00', NULL),
	('ee2f9bda-167d-4896-85c0-41f304ca001a', '9f28093a-c6b9-479e-add0-a90ff7635006', '26-01185', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:26.619221+00', '2026-10-07 02:35:26.619221+00', NULL),
	('f185496d-e541-49d3-a516-ddd85ddde6cb', '7e41e735-aa4f-4e95-a18e-ab10a449f8eb', '26-01215', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:27.454692+00', '2026-10-07 02:35:27.454692+00', NULL),
	('50482a20-7df8-4fc5-97d8-7745fc407603', '634ba7cf-ddb7-474a-baea-2fe3c405e023', '26-01203', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:27.862211+00', '2026-10-07 02:35:27.862211+00', NULL),
	('cf2525f3-a55f-4bff-9e34-62ce63f5ab02', 'c3131ad5-d659-47f1-9563-db2a858cc34e', '26-01295', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:28.675634+00', '2026-10-07 02:35:28.675634+00', NULL),
	('e5b0acbc-5b04-4d3a-b2fc-cc761d2ee486', '94ba54d4-4d0f-4d39-b166-c83c1ae084af', '26-01189', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:29.088649+00', '2026-10-07 02:35:29.088649+00', NULL),
	('5af0b2c6-7383-403d-ba0a-33580241705f', '7861e38c-7c97-4289-b684-e549defb887a', '26-00148', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:29.895136+00', '2026-10-07 02:35:29.895136+00', NULL),
	('e0280976-4572-4df2-8104-5b56fe7356f1', '224ad683-6f5f-4ac2-9a46-9b380abc9b9f', '26-01216', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:30.29583+00', '2026-10-07 02:35:30.29583+00', NULL),
	('2e4dae2f-1ef3-4856-9039-954b07478db8', '58e32987-9756-4b25-9353-bbff1980410e', '26-01222', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:37.973742+00', '2026-10-07 03:20:37.973742+00', NULL),
	('e1c7abf8-4201-4643-8349-3a0768b1c1fa', '519b8d95-a005-4b98-8b4e-146cb3dd2fb2', '26-01272', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:38.968303+00', '2026-10-07 03:20:38.968303+00', NULL),
	('7126d136-f2bb-417a-815e-e0581cb4a578', 'd2d7b136-a95b-4e7b-ba9d-3640b81c7232', '26-01118', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:40.766197+00', '2026-10-07 03:20:40.766197+00', NULL),
	('625df6dd-1843-4ebd-97dc-46e398e74d14', 'c1978c2a-3c4b-4699-9b40-84b54b6985c2', '26-00647', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:41.637271+00', '2026-10-07 03:20:41.637271+00', NULL),
	('8809b492-cae7-4d48-94c6-a2fb20ae5d16', 'd358c733-f2b0-4b3e-a703-c0f81f381b1a', '26-01088', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:42.436187+00', '2026-10-07 03:20:42.436187+00', NULL),
	('bd16f16e-ea9c-4809-b7b8-1fd204440acc', '2df86b71-eafa-4243-80cf-5f70f5ad0838', '26-01090', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:43.285509+00', '2026-10-07 03:20:43.285509+00', NULL),
	('43d2a101-6d05-4ced-9faa-68cfd878e8c8', 'b08dd6a8-6d76-41a1-98f8-872ccc1ddae7', '26-01188', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:44.154287+00', '2026-10-07 03:20:44.154287+00', NULL),
	('59ce746e-c4b9-4234-857f-3eb01f8d7a36', '8a35700e-a311-4e3e-bdbc-a35fe3dd7e2a', '26-00653', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:44.97058+00', '2026-10-07 03:20:44.97058+00', NULL),
	('d5555e52-d80c-4dcf-87db-c70f62c201c9', '65a6ad20-9692-4a88-941d-d15715b43fa2', '26-00662', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:45.784706+00', '2026-10-07 03:20:45.784706+00', NULL),
	('3aad9b1a-6b65-47de-8357-43737feacfee', '4eda7033-e634-4401-aeee-f705ec6502e0', '26-00682', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:46.663655+00', '2026-10-07 03:20:46.663655+00', NULL),
	('26446bda-000b-444e-b2df-a0fbabbf037d', 'a7037b76-16fe-4a81-ba0b-6a70650c91a5', '26-01265', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:47.45028+00', '2026-10-07 03:20:47.45028+00', NULL),
	('b6f62fac-65f6-4d35-8312-6b02bec9b76b', 'eb13dc10-d11c-486d-8035-8ecc0d85cb50', '26-00680', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:48.294101+00', '2026-10-07 03:20:48.294101+00', NULL),
	('bac21bfc-0c2c-4361-a9e6-e5f26e69411f', '57151be4-3141-4ed6-8f49-a8cb1c5c4893', '26-01252', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:49.084462+00', '2026-10-07 03:20:49.084462+00', NULL),
	('231d9b45-056c-424f-bdb3-95e7fe26c587', '46f59be4-8fa3-40a6-8d44-83418e39df11', '26-00686', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:49.88054+00', '2026-10-07 03:20:49.88054+00', NULL),
	('b54813d3-4f04-4849-855e-c13534e266d0', '83d39690-0a87-4d03-85e9-2597aae576ac', '26-01257', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:39.858653+00', '2026-10-07 03:20:39.858653+00', NULL),
	('9f451c2c-3506-403e-a60a-51d085cd5c14', '43cd45ee-ee65-4333-b0f3-194163d12abd', '26-01193', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:24.160073+00', '2026-10-07 02:35:24.160073+00', NULL),
	('a2eac56d-6e08-45df-8c46-69489d890dd1', '92e99bd4-1e4d-4e24-9ca5-98e94534f9c7', '26-00752', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:13.956811+00', '2026-10-07 02:35:13.956811+00', NULL),
	('31f4bf76-7939-44df-acab-6013e1ee1bb3', '3faa5a8b-2245-4d45-8896-834ee38ee22e', '26-00924', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:15.633543+00', '2026-10-07 02:35:15.633543+00', NULL),
	('ade201f2-4bd3-456b-8640-044ac8f80873', 'd7993839-f3df-4468-8431-4b1cff079a13', '26-00577', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:16.868844+00', '2026-10-07 02:35:16.868844+00', NULL),
	('076f3ac5-74c5-4d40-96b8-21bf3e95d756', 'aa66c537-fade-46e0-97e9-7256ecc56e0b', '26-01259', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:18.278505+00', '2026-10-07 02:35:18.278505+00', NULL),
	('a876eedf-d94f-4bca-a7fc-be30519fc8e0', 'd113e0d4-64e2-45a2-a419-0576d0a35af9', '26-00604', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:19.573748+00', '2026-10-07 02:35:19.573748+00', NULL),
	('8194b2dc-5f99-4e9b-8d0a-2fe8c0106703', '454bab49-db39-4cf3-8403-0afafb23f02a', '26-01187', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:20.844357+00', '2026-10-07 02:35:20.844357+00', NULL),
	('e70d6026-da51-42c9-894a-dc61956b28ca', 'a2fec7fc-a29e-41a2-83b1-2155ab025941', '26-01298', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:22.1191+00', '2026-10-07 02:35:22.1191+00', NULL),
	('91f87633-82e5-4986-a8d3-d9a242d2dcf4', '5662c20f-bccb-44cb-9059-ecf4b6dfade3', '26-01205', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:23.337312+00', '2026-10-07 02:35:23.337312+00', NULL),
	('6edc3952-a039-4bb3-9964-fdad8d02b5b7', '4b9135a2-cedc-4da6-af4c-46391eac7d40', '26-01293', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:24.572252+00', '2026-10-07 02:35:24.572252+00', NULL),
	('ac675a72-d81f-4457-8a64-a5a787373ba6', 'bda9ddc8-043a-43be-8c19-05e64224e187', '26-01192', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:25.798959+00', '2026-10-07 02:35:25.798959+00', NULL),
	('973c4bad-bf09-47d6-bac3-3cbf07a02e4b', '5ad3a140-0973-4892-bba1-c5226492c4eb', '26-01191', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:28.27053+00', '2026-10-07 02:35:28.27053+00', NULL),
	('faba7642-9486-465f-a021-75527af482ef', '7612e938-015d-45c1-8b00-453ed3b5a018', '26-01202', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:29.505266+00', '2026-10-07 02:35:29.505266+00', NULL),
	('4f563913-e3cf-4c2b-8f45-43ee3a000c5b', '3438496b-2569-459f-ab01-d1936cfde80c', '26-00619', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:37.446813+00', '2026-10-07 03:20:37.446813+00', NULL),
	('14027baf-82e6-4f77-a968-03164d09d05f', 'fa017f0c-e797-4ef8-87f7-d7ec99779f5a', '26-00623', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:38.573106+00', '2026-10-07 03:20:38.573106+00', NULL),
	('d65c938b-c48e-4efe-92fb-73e2664a0d0e', '8543d44d-ae42-4788-8e5f-072e70479e99', '26-01218', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:39.446017+00', '2026-10-07 03:20:39.446017+00', NULL),
	('38cc575b-8a3f-41fe-8a14-1e0b2a898ee0', '8b37dd34-c086-4735-ba9d-0778baab0f1e', '26-00617', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:40.326782+00', '2026-10-07 03:20:40.326782+00', NULL),
	('8a1fee9e-884c-4789-9514-c06475bf52ef', '5cfc447b-f5c3-4efe-8d77-60b6fc19a4c6', '26-00644', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:41.14989+00', '2026-10-07 03:20:41.14989+00', NULL),
	('3bfdd93a-32f9-4be6-b3e7-65aca1de84ba', 'bc425ab6-0381-49bc-914a-fc12d1a6ac83', '26-01269', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:42.044886+00', '2026-10-07 03:20:42.044886+00', NULL),
	('724a18b3-cdc8-4ff1-8317-0914498062e7', '7659f51f-4bba-4317-b0bd-17ac8cd78ad9', '26-00645', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:42.824576+00', '2026-10-07 03:20:42.824576+00', NULL),
	('f2245b1f-ff5f-4507-907c-1d3f6b4ec062', '48a87201-8472-4d1c-8a24-c7f67ed2d76d', '26-00712', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:44.56939+00', '2026-10-07 03:20:44.56939+00', NULL),
	('7d21b4f1-da8b-47d5-8712-45141089721b', 'a054dfd8-50f3-4d72-861f-db18783895ba', '26-01262', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:45.37839+00', '2026-10-07 03:20:45.37839+00', NULL),
	('dec67357-0c8e-489b-82d3-0bf25cf05842', '12ecfbb5-370b-4baa-afbc-0bb432e5ccb1', '26-00665', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:46.192323+00', '2026-10-07 03:20:46.192323+00', NULL),
	('37fbbe52-d873-42a2-8050-3edbafc00834', '65b4c3df-dbcd-49ee-9285-28cffe6a5b2d', '26-01214', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:47.056061+00', '2026-10-07 03:20:47.056061+00', NULL),
	('ab999222-9389-4f42-80d1-6697683e8241', '8c80f94b-501c-4ac8-b22a-754965c32230', '26-00674', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:47.845974+00', '2026-10-07 03:20:47.845974+00', NULL),
	('a6ad9f34-8425-4236-b013-41d28d9ada00', 'eff604aa-36df-442a-be05-512579eb5943', '26-01200', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:48.688406+00', '2026-10-07 03:20:48.688406+00', NULL),
	('fc64efb4-0416-4e71-be25-fc17330fe972', 'ad6db960-607e-4e2f-a326-649031739ace', '26-01258', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:49.48734+00', '2026-10-07 03:20:49.48734+00', NULL),
	('becdb11e-ba05-4ca1-b57b-32d989cd6ea6', '57ee444e-43e8-4f87-8c90-f963254b5d31', '26-00691', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:50.27469+00', '2026-10-07 03:20:50.27469+00', NULL),
	('24b68869-24b3-4fb3-b232-81801242de5b', '7af364f9-c152-4b01-a79f-fc412c7f19fe', '26-01196', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:51.063426+00', '2026-10-07 03:20:51.063426+00', NULL),
	('be24a027-f44e-4a72-83ea-db20bf2bc109', '7c8163c5-709d-469b-b190-e0ffc12e3dae', '26-00698', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:51.851813+00', '2026-10-07 03:20:51.851813+00', NULL),
	('109803d4-d7ff-4f0f-a374-83fc38a401dc', '3fedde38-9b31-4427-9fbd-4a17a8deac4f', '26-00700', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:52.623583+00', '2026-10-07 03:20:52.623583+00', NULL),
	('7b3d257f-3610-4573-a0ee-19db554a02b8', 'a129a004-6c54-4e8a-869f-94ac101efac3', '26-00707', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:53.401361+00', '2026-10-07 03:20:53.401361+00', NULL),
	('4762b690-ebe0-4c2b-adb8-c78c79fad3a7', '237f4927-ebfc-485e-8455-e9f9f17ca50e', '26-01309', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'b0892616-bd31-419f-93f5-6eb4611f54bf', 1, 'enrolled', '2026-10-07 03:20:43.672135+00', '2026-10-07 03:20:43.672135+00', NULL),
	('6a1822b0-597a-4209-9410-debb2317ed73', '87df5347-2588-4df6-ba96-3bcbb59b244a', '26-01195', 'aeb10d96-5d6a-4fff-aa59-99a0c4bb0daa', 'b0a8b026-575c-4e4a-93bf-83ac51efe431', 'a1d00485-bc7d-4e6b-97b6-d846f9c68236', 1, 'enrolled', '2026-10-07 02:35:27.023891+00', '2026-10-07 02:35:27.023891+00', NULL);


--
-- Data for Name: facial_profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: qr_credentials; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."qr_credentials" ("id", "student_id", "token_hash", "credential_status", "issued_at", "expires_at", "revoked_at", "last_successful_check_in_at", "created_at", "updated_at") VALUES
	('d0e98239-ba50-4949-8a01-b50ac8b2a16d', 'aad11284-90b9-400f-90fc-bbf72e9d933e', 'e2b7d0dbeb8a1f4f3e8b1c02429637531440964f7da023c53354337670036c9b', 'activated', '2026-10-07 02:38:52.242361+00', '2027-10-07 02:38:52.242361+00', NULL, NULL, '2026-10-07 02:38:52.242361+00', '2026-10-07 02:38:52.242361+00'),
	('7be499f3-be1b-4cd1-8ef2-92edb0107701', 'a2eac56d-6e08-45df-8c46-69489d890dd1', 'e3d31b21934504070f48ed9f35ef4efaecdce104529a74f9b593e07507725ae2', 'activated', '2026-10-07 02:51:04.371392+00', '2027-10-07 02:51:04.371392+00', NULL, NULL, '2026-10-07 02:51:04.371392+00', '2026-10-07 02:51:04.371392+00'),
	('baafae16-936b-4563-85b7-87074497f074', '31f4bf76-7939-44df-acab-6013e1ee1bb3', '8538355bba1227d72672bb1deebfca291e208e21c08f6012c9dfde766fbafb70', 'activated', '2026-10-07 02:52:24.103012+00', '2027-10-07 02:52:24.103012+00', NULL, NULL, '2026-10-07 02:52:24.103012+00', '2026-10-07 02:52:24.103012+00'),
	('5f9a3adb-17c8-483e-935a-81314dc1c9f5', '84e0a415-cdfe-49bf-8306-6fd8c0af71f2', '8f915e0348bda13bd9df972647608372bd1fd938610b3ec2becd012d488241b9', 'activated', '2026-10-07 02:54:21.863086+00', '2027-10-07 02:54:21.863086+00', NULL, NULL, '2026-10-07 02:54:21.863086+00', '2026-10-07 02:54:21.863086+00'),
	('c1c15e45-b7c8-4859-9051-1b5300fbaff6', '076f3ac5-74c5-4d40-96b8-21bf3e95d756', 'e9eec476bf0299f2dcf1ad7e419cd98d8ad4eceb45084c6cf19ab125cc15fceb', 'activated', '2026-10-07 02:55:19.853846+00', '2027-10-07 02:55:19.853846+00', NULL, NULL, '2026-10-07 02:55:19.853846+00', '2026-10-07 02:55:19.853846+00'),
	('3640d8e4-2952-49c9-9c59-9dc3f37961e6', '57e136b5-5d39-49ec-b782-74ff31380685', '6b23a20dd00d03966caf098e5089964be535d116cd38bacfc729bc66a8222363', 'activated', '2026-10-07 02:55:50.565917+00', '2027-10-07 02:55:50.565917+00', NULL, NULL, '2026-10-07 02:55:50.565917+00', '2026-10-07 02:55:50.565917+00'),
	('f08d82e9-702b-400f-8653-c76e29c478ad', 'a876eedf-d94f-4bca-a7fc-be30519fc8e0', 'a560c9d735be2c05239312cc84f0ac611a49663e4c9877b90dfe8621b542c354', 'activated', '2026-10-07 02:56:46.632427+00', '2027-10-07 02:56:46.632427+00', NULL, NULL, '2026-10-07 02:56:46.632427+00', '2026-10-07 02:56:46.632427+00'),
	('e536e9d4-e27f-4afd-85f0-43ea8e742792', '8194b2dc-5f99-4e9b-8d0a-2fe8c0106703', 'bd07f91105dd3aab470d48764c2996490209c1a1077c6346bb2bb2d067b785bc', 'activated', '2026-10-07 02:58:27.370166+00', '2027-10-07 02:58:27.370166+00', NULL, NULL, '2026-10-07 02:58:27.370166+00', '2026-10-07 02:58:27.370166+00'),
	('c81eda55-f086-4944-b08d-7212d3ed5690', '1cf85218-4552-402f-8aab-a5b72c7cba09', '1992f7662d64fc54ce36c728b6bc1c1a8167de3756491aac2849edebaf58471a', 'activated', '2026-10-07 03:00:14.889014+00', '2027-10-07 03:00:14.889014+00', NULL, NULL, '2026-10-07 03:00:14.889014+00', '2026-10-07 03:00:14.889014+00'),
	('bf8a0928-d73f-4fdd-8bac-ce1a37de0fa6', '7b3a7033-d13e-4fa2-8f40-4bdddb27e5f1', 'f6ff41e9c7c8c19571a9d6391b294d0196efab41c139ef4024d8ede425700b5c', 'activated', '2026-10-07 03:01:36.206161+00', '2027-10-07 03:01:36.206161+00', NULL, NULL, '2026-10-07 03:01:36.206161+00', '2026-10-07 03:01:36.206161+00'),
	('5f7e3ac9-abae-42c4-b900-944b8d6da3f2', '6edc3952-a039-4bb3-9964-fdad8d02b5b7', '1606623ac2fee2273a4a3ab768ec7e3014ae5087d6b8951a12faf8cf7a353d88', 'activated', '2026-10-07 03:06:58.258057+00', '2027-10-07 03:06:58.258057+00', NULL, NULL, '2026-10-07 03:06:58.258057+00', '2026-10-07 03:06:58.258057+00'),
	('0d03de12-e601-41e3-874e-95250ec760f8', '0bb1949e-d9df-476d-945b-2f55a1ce04a2', '8175ff952fa91338d1d89fabe3a0c21e6064f8a8bfa3ba5434badc8b97a4b1e1', 'activated', '2026-10-07 03:07:26.667665+00', '2027-10-07 03:07:26.667665+00', NULL, NULL, '2026-10-07 03:07:26.667665+00', '2026-10-07 03:07:26.667665+00'),
	('93fa0f19-9ab8-41a7-aa7f-c47357eb9cd5', 'ac675a72-d81f-4457-8a64-a5a787373ba6', '028e7c8dc48170687b6bacc354384f19855cd52cce461b75cd6e75474d3ebf66', 'activated', '2026-10-07 03:08:48.291234+00', '2027-10-07 03:08:48.291234+00', NULL, NULL, '2026-10-07 03:08:48.291234+00', '2026-10-07 03:08:48.291234+00'),
	('1424f394-e72e-4628-bd8a-4afef21d1d5f', 'ee2f9bda-167d-4896-85c0-41f304ca001a', 'a865c060a964c444c3e7ced43f1a15fdae10c299e772b835f01a3c54a1273d01', 'activated', '2026-10-07 03:09:57.080188+00', '2027-10-07 03:09:57.080188+00', NULL, NULL, '2026-10-07 03:09:57.080188+00', '2026-10-07 03:09:57.080188+00'),
	('557b1463-1cdf-4dc2-8a44-e9199351452b', 'f185496d-e541-49d3-a516-ddd85ddde6cb', '19375c8fbf3fa408a0b37ad6da68c7dfa91edf5b36001f7adf6312a9c6276d41', 'activated', '2026-10-07 03:11:51.591904+00', '2027-10-07 03:11:51.591904+00', NULL, NULL, '2026-10-07 03:11:51.591904+00', '2026-10-07 03:11:51.591904+00'),
	('66c6ee33-57cb-415f-a0d3-618cefe2f8d7', '973c4bad-bf09-47d6-bac3-3cbf07a02e4b', '379b8179dc7442d8c8b889008b6445be39c36b454c60606fc68a5640c169cd42', 'activated', '2026-10-07 03:12:41.540668+00', '2027-10-07 03:12:41.540668+00', NULL, NULL, '2026-10-07 03:12:41.540668+00', '2026-10-07 03:12:41.540668+00'),
	('9df86e97-7cfc-43ca-aabd-8240aeed4110', 'e5b0acbc-5b04-4d3a-b2fc-cc761d2ee486', '170c82dce7e2e9e0e260bd2050c007690c4b2b5aea1e48f786aef71aa3ab6261', 'activated', '2026-10-07 03:13:38.612438+00', '2027-10-07 03:13:38.612438+00', NULL, NULL, '2026-10-07 03:13:38.612438+00', '2026-10-07 03:13:38.612438+00'),
	('ffa830f4-a6c9-4682-93fa-581c8e49a9dc', 'faba7642-9486-465f-a021-75527af482ef', '3f7fecc355513474230111badffa7b63f7a368bf86239f92c766f54f57158fd7', 'activated', '2026-10-07 03:14:07.56637+00', '2027-10-07 03:14:07.56637+00', NULL, NULL, '2026-10-07 03:14:07.56637+00', '2026-10-07 03:14:07.56637+00'),
	('2745023c-0582-4a74-8b59-9624c7b6a8f0', '2e4dae2f-1ef3-4856-9039-954b07478db8', 'da305c95ca1c559943fb301760abf6ab065f8fcf2e2479d141ff2c2f8babe891', 'activated', '2026-10-07 03:48:29.748373+00', '2027-10-07 03:48:29.748373+00', NULL, NULL, '2026-10-07 03:48:29.748373+00', '2026-10-07 03:48:29.748373+00'),
	('f2b8fc57-58ec-4cda-8892-52fcfdeb697c', '14027baf-82e6-4f77-a968-03164d09d05f', '081c227304d3e9d64680acad67a266719e1f5fbe8247bfd1845db7c5a204a41f', 'activated', '2026-10-07 03:49:03.977641+00', '2027-10-07 03:49:03.977641+00', NULL, NULL, '2026-10-07 03:49:03.977641+00', '2026-10-07 03:49:03.977641+00'),
	('2e27097b-c70c-4275-aedc-3b23995fbb03', 'd65c938b-c48e-4efe-92fb-73e2664a0d0e', 'e8cecfdc771e5393f69a2ddbf1c0238c4c906cdef52700715d6c6b8c089c9f4b', 'activated', '2026-10-07 03:50:03.812939+00', '2027-10-07 03:50:03.812939+00', NULL, NULL, '2026-10-07 03:50:03.812939+00', '2026-10-07 03:50:03.812939+00'),
	('3335ed38-8c67-46b2-8ef4-b1287d7d10e6', '38cc575b-8a3f-41fe-8a14-1e0b2a898ee0', 'd348c074e85aa2b8a84cc7b74eaeec5a61c1b88b63fb1b4c81ea3cdac7aaef21', 'activated', '2026-10-07 03:52:32.758259+00', '2027-10-07 03:52:32.758259+00', NULL, NULL, '2026-10-07 03:52:32.758259+00', '2026-10-07 03:52:32.758259+00'),
	('8e84d3d5-fc33-46f3-9734-e08d704c819c', '8a1fee9e-884c-4789-9514-c06475bf52ef', 'bb4fb813e9faa953b24ea4a7f20d2ff02b77f38b3eec26ec3a3e69b4c2be207a', 'activated', '2026-10-07 03:54:33.199963+00', '2027-10-07 03:54:33.199963+00', NULL, NULL, '2026-10-07 03:54:33.199963+00', '2026-10-07 03:54:33.199963+00'),
	('fcb7a107-b4eb-4b7e-a537-b4eb4f7fa281', '8809b492-cae7-4d48-94c6-a2fb20ae5d16', '8389361ec7c22d137ad7af919391a2cb3c02e66de0ea603c28f1f7b3cc8eec77', 'activated', '2026-10-07 03:56:48.821842+00', '2027-10-07 03:56:48.821842+00', NULL, NULL, '2026-10-07 03:56:48.821842+00', '2026-10-07 03:56:48.821842+00'),
	('72c65486-7475-4994-bd23-7eee3f615e1b', 'bd16f16e-ea9c-4809-b7b8-1fd204440acc', '310ea7cb6e1cda7efd778c23e0061e7019051f94e7bb0f734c082ac7f29ac762', 'activated', '2026-10-07 03:58:41.533346+00', '2027-10-07 03:58:41.533346+00', NULL, NULL, '2026-10-07 03:58:41.533346+00', '2026-10-07 03:58:41.533346+00'),
	('cbe9540a-361e-48a0-9f7c-361c7ed36c28', '43d2a101-6d05-4ced-9faa-68cfd878e8c8', '20e380b49855b583daad428bc088bd7f5d425c63e161412abb461842f7aa2687', 'activated', '2026-10-07 04:01:53.621415+00', '2027-10-07 04:01:53.621415+00', NULL, NULL, '2026-10-07 04:01:53.621415+00', '2026-10-07 04:01:53.621415+00'),
	('ff38efc8-07d4-4017-8e07-4578d5901298', '7b3d257f-3610-4573-a0ee-19db554a02b8', '08d9fbab046b4b1ee884a234d86df45aec7cc9448e06b72574f627182e6ae418', 'activated', '2026-10-07 04:15:15.751502+00', '2027-10-07 04:15:15.751502+00', NULL, NULL, '2026-10-07 04:15:15.751502+00', '2026-10-07 04:15:15.751502+00'),
	('ebac70c7-9fa7-446c-9953-d74c26ad6910', '59ce746e-c4b9-4234-857f-3eb01f8d7a36', 'dab6280d9df03ef8287e3235652b51ae85be8b69a3021e8ef25804c8171b51c4', 'activated', '2026-10-07 04:03:16.296264+00', '2027-10-07 04:03:16.296264+00', NULL, NULL, '2026-10-07 04:03:16.296264+00', '2026-10-07 04:03:16.296264+00'),
	('9caf1aff-0d8f-40ce-8952-a362880338b4', 'd5555e52-d80c-4dcf-87db-c70f62c201c9', 'c95d0f5439387f38e04483faa223d11506c9d651d9760a90a02debf62e935b7b', 'activated', '2026-10-07 04:04:10.991639+00', '2027-10-07 04:04:10.991639+00', NULL, NULL, '2026-10-07 04:04:10.991639+00', '2026-10-07 04:04:10.991639+00'),
	('c9eb9249-5daf-49cc-a2fe-6430ce1ee36d', 'dec67357-0c8e-489b-82d3-0bf25cf05842', '4d6cf9c09898d124428be7de4c99d8a4212ce45bab668f993414b221b3f78b34', 'activated', '2026-10-07 04:04:41.322618+00', '2027-10-07 04:04:41.322618+00', NULL, NULL, '2026-10-07 04:04:41.322618+00', '2026-10-07 04:04:41.322618+00'),
	('f33f007c-6d95-4585-aad2-91770c47802f', '37fbbe52-d873-42a2-8050-3edbafc00834', 'f2fc8967945f8b52e23e162f75111e7a9bb0cd34f07cd148140511b19cf846f6', 'activated', '2026-10-07 04:05:27.988423+00', '2027-10-07 04:05:27.988423+00', NULL, NULL, '2026-10-07 04:05:27.988423+00', '2026-10-07 04:05:27.988423+00'),
	('2f42ea6f-5890-4ecb-96e2-3ce26efcb2aa', 'ab999222-9389-4f42-80d1-6697683e8241', '51a23a5b7e818cb5e6026be518a0fb4d3157dd06bf7fc8a41f8f73bba2c2030a', 'activated', '2026-10-07 04:06:33.431505+00', '2027-10-07 04:06:33.431505+00', NULL, NULL, '2026-10-07 04:06:33.431505+00', '2026-10-07 04:06:33.431505+00'),
	('41de4107-7abd-49d4-86d4-378f386cc923', 'b6f62fac-65f6-4d35-8312-6b02bec9b76b', '966bc313798252632177fba0a96a9f5b30233ff9acb628840496c129bc5dae7a', 'activated', '2026-10-07 04:07:07.944124+00', '2027-10-07 04:07:07.944124+00', NULL, NULL, '2026-10-07 04:07:07.944124+00', '2026-10-07 04:07:07.944124+00'),
	('760e0705-9c02-4c7f-9730-89e2e3596986', 'a6ad9f34-8425-4236-b013-41d28d9ada00', 'fea3bc12a655bac444c3e9769b032cd79566d2fcdba01a1a5b8a8665a19fba99', 'activated', '2026-10-07 04:07:52.656+00', '2027-10-07 04:07:52.656+00', NULL, NULL, '2026-10-07 04:07:52.656+00', '2026-10-07 04:07:52.656+00'),
	('ad26d407-2b61-46af-95d5-3975cca3cf6d', 'fc64efb4-0416-4e71-be25-fc17330fe972', '00e06d337745e102961c3c690a614d836a4903ddaa04133e9979e45f0af82894', 'activated', '2026-10-07 04:09:52.596643+00', '2027-10-07 04:09:52.596643+00', NULL, NULL, '2026-10-07 04:09:52.596643+00', '2026-10-07 04:09:52.596643+00'),
	('b45cdfb2-274d-4a79-aaa1-5138e96cf421', 'becdb11e-ba05-4ca1-b57b-32d989cd6ea6', 'f56edfbe72d4ba746f5b58046fe1fcc09e35bb1b41aa6517c5367094f38931a8', 'activated', '2026-10-07 04:10:49.413653+00', '2027-10-07 04:10:49.413653+00', NULL, NULL, '2026-10-07 04:10:49.413653+00', '2026-10-07 04:10:49.413653+00'),
	('a669ff62-1cd2-452e-9928-251738e584d1', 'b821d5f7-569f-409b-80fe-0acb67bb2274', 'e62e1f95d027a4fd1430d791ea3318b6f8dd24f05e81945e6c7093ea610b26ef', 'activated', '2026-10-07 04:11:15.528631+00', '2027-10-07 04:11:15.528631+00', NULL, NULL, '2026-10-07 04:11:15.528631+00', '2026-10-07 04:11:15.528631+00'),
	('e660b150-c9ad-4722-9a94-f31f38f7180c', '109803d4-d7ff-4f0f-a374-83fc38a401dc', 'cd43abaefb869b58d70b3a0e8749fec6b26a870a74ec210851f175a881589366', 'activated', '2026-10-07 04:13:24.698528+00', '2027-10-07 04:13:24.698528+00', NULL, NULL, '2026-10-07 04:13:24.698528+00', '2026-10-07 04:13:24.698528+00'),
	('92d89a71-a408-450d-b6cb-67ae9aaa7561', '79c46da3-0a01-4c5d-a848-631ea8850b04', '83fed475dbcc90426c84c3627fabfc48044c4f3c1a38bb8b3e8d872d57fbd93a', 'activated', '2026-10-07 04:13:54.186839+00', '2027-10-07 04:13:54.186839+00', NULL, NULL, '2026-10-07 04:13:54.186839+00', '2026-10-07 04:13:54.186839+00'),
	('38a37a8b-3e34-465e-b44c-ecd100183328', '6a1822b0-597a-4209-9410-debb2317ed73', '4552a82030d49b29d56f65216ea8165c1e62174f953e5ad773c22cfb78173abe', 'inactive', '2026-10-07 03:11:24.642073+00', '2027-10-07 03:11:24.642073+00', '2026-10-07 05:46:20.828881+00', NULL, '2026-10-07 03:11:24.642073+00', '2026-10-07 05:46:20.828881+00'),
	('12651acc-432e-4955-999d-906af2157555', '9f451c2c-3506-403e-a60a-51d085cd5c14', '09a30a0faa22c2c84b81ebf6a6c7c606e2cf08388b833b140d4327ff38790a36', 'inactive', '2026-10-07 05:44:50.199304+00', '2027-10-07 05:44:50.199304+00', '2026-10-07 05:50:27.432281+00', NULL, '2026-10-07 05:44:50.199304+00', '2026-10-07 05:50:27.432281+00'),
	('d0e6bbbc-14f0-46a8-b249-14340aa59b81', '4762b690-ebe0-4c2b-adb8-c78c79fad3a7', '653cc9964af504d3b43b33248c5aab059acd8f5115d19d53ca7d0e90d6462f2f', 'inactive', '2026-10-07 05:32:07.068671+00', '2027-10-07 05:32:07.068671+00', '2026-10-07 05:55:26.001975+00', NULL, '2026-10-07 05:32:07.068671+00', '2026-10-07 05:55:26.001975+00'),
	('d22f55e4-c838-4ffd-85ed-78c3a04642f6', '251f8c01-b1b2-4c4d-952e-8ece5ef3e8c1', '01419b57cf71c308942763be73e99ca979df14f84d35f319583fd82125943eda', 'activated', '2026-10-07 02:40:16.747687+00', '2027-10-07 02:40:16.747687+00', NULL, NULL, '2026-10-07 02:40:16.747687+00', '2026-10-07 02:40:16.747687+00'),
	('b42442de-ec0a-40e6-9053-92126c2f59a4', '92548b77-eab1-46fe-9fac-e5fa4de95cda', '36c4db005c2219a37bd51a6d5668a4c6aef9446cfe4f464d57e1775860827390', 'activated', '2026-10-07 02:51:36.601813+00', '2027-10-07 02:51:36.601813+00', NULL, NULL, '2026-10-07 02:51:36.601813+00', '2026-10-07 02:51:36.601813+00'),
	('c8fd13c3-6cd2-4a21-9bfb-e785b7127842', '47cbda40-8699-4489-87a7-c25e53bc4826', '044a4e484dddf8933d81b265755e28e1fc2d2793310b8ecbc40b7217af8fd6cb', 'activated', '2026-10-07 02:52:56.736582+00', '2027-10-07 02:52:56.736582+00', NULL, NULL, '2026-10-07 02:52:56.736582+00', '2026-10-07 02:52:56.736582+00'),
	('3a354e72-fcdf-4001-b737-abf60e348568', '32648e81-4c6e-4bcc-b1f3-624075d83081', 'ae0459eb402e460fd3ce7c9c446885c62750f8da459574798406b524752660fc', 'activated', '2026-10-07 02:53:20.035252+00', '2027-10-07 02:53:20.035252+00', NULL, NULL, '2026-10-07 02:53:20.035252+00', '2026-10-07 02:53:20.035252+00'),
	('3a12024b-60bf-482b-a849-f6ca606049d4', 'ade201f2-4bd3-456b-8640-044ac8f80873', 'c80a55b187cd0797f0fedbf24035d73d5477442214750c6295dff1e4d1ee0884', 'activated', '2026-10-07 02:53:53.270822+00', '2027-10-07 02:53:53.270822+00', NULL, NULL, '2026-10-07 02:53:53.270822+00', '2026-10-07 02:53:53.270822+00'),
	('87ef4564-5fa6-4289-ac4e-815f9171b154', 'c906cad5-a755-45ec-8070-f612aca4b186', '5542b7ea5263f037772821edb9535c3d24d2b42640431c805b23b3e386e191fa', 'activated', '2026-10-07 02:54:49.255201+00', '2027-10-07 02:54:49.255201+00', NULL, NULL, '2026-10-07 02:54:49.255201+00', '2026-10-07 02:54:49.255201+00'),
	('7482ff63-c177-45de-8b4b-0a2d7ec3af8c', '0e13f715-e630-411f-b9fc-c5737f684b7e', '33f566258491311215bc1aafdabc809bf20a853a33bade7778a1912bb2ba70cf', 'activated', '2026-10-07 02:56:17.994965+00', '2027-10-07 02:56:17.994965+00', NULL, NULL, '2026-10-07 02:56:17.994965+00', '2026-10-07 02:56:17.994965+00'),
	('42e77f62-286d-4198-a11a-e776fe60b69f', '0eb3c191-c9cc-4c58-9ff0-1349d0220490', 'c2d218c09198c00d60508f8f85f5a6f9b5c72b530f1a684f19a0c35183d27913', 'activated', '2026-10-07 02:57:17.635074+00', '2027-10-07 02:57:17.635074+00', NULL, NULL, '2026-10-07 02:57:17.635074+00', '2026-10-07 02:57:17.635074+00'),
	('0943f392-4e7b-438d-a4dd-ec0c322cd180', 'c1eb24a5-461d-4616-a80b-822e3ebd6df5', 'd7f8fef6c32dfc2aa99f1c885489c75010756c5ca8b774c587cf34b4ea60777f', 'activated', '2026-10-07 02:57:48.275657+00', '2027-10-07 02:57:48.275657+00', NULL, NULL, '2026-10-07 02:57:48.275657+00', '2026-10-07 02:57:48.275657+00'),
	('cd0e3f93-0f71-45eb-b1b3-6c5ceb5ccc95', '0395d233-bea6-435c-8d22-7afec03b5469', 'a26cb4ac82819fa9ffa76a4feb170fc48d603ee0b55ab2a8a723d755e85c56c6', 'activated', '2026-10-07 02:58:50.519489+00', '2027-10-07 02:58:50.519489+00', NULL, NULL, '2026-10-07 02:58:50.519489+00', '2026-10-07 02:58:50.519489+00'),
	('75b5d6fd-e6f8-497a-97f8-8b4213ae7dcb', '06230bcd-f6a1-457f-aa71-a51db55140b0', 'f8b188e69c0d92b0e1451d91e069f448d8fff18767ef84a341be3105384bd4c3', 'activated', '2026-10-07 02:59:14.495408+00', '2027-10-07 02:59:14.495408+00', NULL, NULL, '2026-10-07 02:59:14.495408+00', '2026-10-07 02:59:14.495408+00'),
	('87178497-6f36-4f6e-a9f3-d4517c2eb159', 'e70d6026-da51-42c9-894a-dc61956b28ca', '7a4c93c7d7fc95fc67872869792b9e8541f4a814fd3a3f9d5650dea1ad55cc29', 'activated', '2026-10-07 02:59:42.853233+00', '2027-10-07 02:59:42.853233+00', NULL, NULL, '2026-10-07 02:59:42.853233+00', '2026-10-07 02:59:42.853233+00'),
	('d4711fc2-78cd-48e9-b81e-8f4d5aed7d07', '72f4803b-0475-4094-8d84-07adbef38dae', '66d2622ed009b625097cf68398adf68951d92d6245284bab7a8aebc38165cea4', 'activated', '2026-10-07 03:00:41.344397+00', '2027-10-07 03:00:41.344397+00', NULL, NULL, '2026-10-07 03:00:41.344397+00', '2026-10-07 03:00:41.344397+00'),
	('bea3ab8c-2b52-415e-9e1b-88d5906c4fa0', '91f87633-82e5-4986-a8d3-d9a242d2dcf4', '41ccc3abb6e96627e7869070cdec5bf299b834a0096d485614187703ff938186', 'activated', '2026-10-07 03:01:07.561476+00', '2027-10-07 03:01:07.561476+00', NULL, NULL, '2026-10-07 03:01:07.561476+00', '2026-10-07 03:01:07.561476+00'),
	('73058bf9-98f6-4c28-ac5b-2432325fb368', 'a97f4db9-0ad8-4a2c-8ed5-65f4c1afc293', '10de2eb2309bab04b4b805491b1dab7b42bad217bb99a7bc72dbc75d6f8096ee', 'activated', '2026-10-07 03:08:12.419592+00', '2027-10-07 03:08:12.419592+00', NULL, NULL, '2026-10-07 03:08:12.419592+00', '2026-10-07 03:08:12.419592+00'),
	('80a6b998-596a-46f2-a447-53ff0103c119', '1cab51bf-c482-4658-94fa-0d6dd65b5c57', 'd3d5b70a064d2555f294e165adb7baaba253fb10b482004f41452ff81e24a276', 'activated', '2026-10-07 03:09:34.068946+00', '2027-10-07 03:09:34.068946+00', NULL, NULL, '2026-10-07 03:09:34.068946+00', '2026-10-07 03:09:34.068946+00'),
	('cbf65dae-f723-4f26-8c0f-30697508d8f0', '50482a20-7df8-4fc5-97d8-7745fc407603', '6ab41eeb51c5b7391c527a10a1eab7bd6133ea5ee3514c08588facd4520e14b6', 'activated', '2026-10-07 03:12:15.68629+00', '2027-10-07 03:12:15.68629+00', NULL, NULL, '2026-10-07 03:12:15.68629+00', '2026-10-07 03:12:15.68629+00'),
	('54fd2ee9-ed08-431b-ab06-ab44fbeb8da4', 'cf2525f3-a55f-4bff-9e34-62ce63f5ab02', 'f83715d830f71717efd2ee705d8a24fca34d6421b235327cd285cd350e5d1cb6', 'activated', '2026-10-07 03:13:13.280479+00', '2027-10-07 03:13:13.280479+00', NULL, NULL, '2026-10-07 03:13:13.280479+00', '2026-10-07 03:13:13.280479+00'),
	('cc0dcd61-bd74-4274-96b1-723f29063303', '5af0b2c6-7383-403d-ba0a-33580241705f', '8765420e43339966002f09273a95384d7c787f44dedd0833931f1ba8ddc43d53', 'activated', '2026-10-07 03:14:33.731513+00', '2027-10-07 03:14:33.731513+00', NULL, NULL, '2026-10-07 03:14:33.731513+00', '2026-10-07 03:14:33.731513+00'),
	('1e6e9923-f972-447f-82c9-f76aa78e7b98', 'e0280976-4572-4df2-8104-5b56fe7356f1', '5b65e58a99c8c638e5ab4baca478e1273bfca80effd845d02c948783e9bd0493', 'activated', '2026-10-07 03:15:03.074378+00', '2027-10-07 03:15:03.074378+00', NULL, NULL, '2026-10-07 03:15:03.074378+00', '2026-10-07 03:15:03.074378+00'),
	('82f2fbcc-2f9a-4464-8389-10fbc35ac5b7', '4a11c534-a3a5-4d6f-8d69-212961799a2f', '013289b41180e19b9c71e04103b9dafe0270aea8db8bb36257fa44bce166d49e', 'activated', '2026-09-21 16:42:01.902308+00', '2027-09-21 16:42:01.902308+00', NULL, '2026-10-02 22:01:15+00', '2026-09-21 16:42:01.902308+00', '2026-10-02 22:01:17.45534+00'),
	('51e1ea59-8ca3-48af-820a-e52648fdf0bd', '4f563913-e3cf-4c2b-8f45-43ee3a000c5b', '8189ada49f9a279b01b0e8a3bb0d056d75ef47514ab3c5cf077cda1ec94c2fb1', 'activated', '2026-10-07 03:47:58.402253+00', '2027-10-07 03:47:58.402253+00', NULL, NULL, '2026-10-07 03:47:58.402253+00', '2026-10-07 03:47:58.402253+00'),
	('f1960103-21a8-421c-a2bd-892fe1d81b3b', 'e1c7abf8-4201-4643-8349-3a0768b1c1fa', '41823e014c47962883335e3b64b5dd89974e9a648328abfeef4f05ce66812062', 'activated', '2026-10-07 03:49:31.627475+00', '2027-10-07 03:49:31.627475+00', NULL, NULL, '2026-10-07 03:49:31.627475+00', '2026-10-07 03:49:31.627475+00'),
	('9d9c0df7-b41c-4317-a66c-aca360f705e8', '7126d136-f2bb-417a-815e-e0581cb4a578', 'c725cab29f4bc1baab59f361407785b46159603e4b5ef2849da49f04d2ea407d', 'activated', '2026-10-07 03:53:01.278266+00', '2027-10-07 03:53:01.278266+00', NULL, NULL, '2026-10-07 03:53:01.278266+00', '2026-10-07 03:53:01.278266+00'),
	('c66fdfa5-5dab-41e5-9310-c31a012b5b8c', '625df6dd-1843-4ebd-97dc-46e398e74d14', '76097fe982195aeb7d8c32a202bed5dfb5eee54131c9fbde80e0af4664115975', 'activated', '2026-10-07 03:55:18.888339+00', '2027-10-07 03:55:18.888339+00', NULL, NULL, '2026-10-07 03:55:18.888339+00', '2026-10-07 03:55:18.888339+00'),
	('4441ebce-6a11-44f4-b7a8-14caedcf4089', '3bfdd93a-32f9-4be6-b3e7-65aca1de84ba', '8760035358cce2e510175c8572cf9dd7fda9a592a95d7e4ebf1d6d60e00cea0d', 'activated', '2026-10-07 03:55:44.754691+00', '2027-10-07 03:55:44.754691+00', NULL, NULL, '2026-10-07 03:55:44.754691+00', '2026-10-07 03:55:44.754691+00'),
	('cb8125f6-762d-4222-876f-4fd3d06f118b', '724a18b3-cdc8-4ff1-8317-0914498062e7', 'f2724912e1545338d84087b400225d735ebb92485025e5843369b306f61140e4', 'activated', '2026-10-07 03:58:16.544473+00', '2027-10-07 03:58:16.544473+00', NULL, NULL, '2026-10-07 03:58:16.544473+00', '2026-10-07 03:58:16.544473+00'),
	('07a361cc-0637-4118-828e-3adbf6773ea2', 'f2245b1f-ff5f-4507-907c-1d3f6b4ec062', 'cfe8707179e25b0a62974f1c9fdcfb2adaed6ae63dfddccaafe962483315882f', 'activated', '2026-10-07 04:02:20.975687+00', '2027-10-07 04:02:20.975687+00', NULL, NULL, '2026-10-07 04:02:20.975687+00', '2026-10-07 04:02:20.975687+00'),
	('bc9ab406-0c99-41d4-a68b-e1ffd84bef2a', '7d21b4f1-da8b-47d5-8712-45141089721b', '869affec1570631f327d44e927b7f6b8979ea7f82bfa89eda6f33e61c003d9d8', 'activated', '2026-10-07 04:03:44.1811+00', '2027-10-07 04:03:44.1811+00', NULL, NULL, '2026-10-07 04:03:44.1811+00', '2026-10-07 04:03:44.1811+00'),
	('87dacbc3-e777-40ed-b605-e92960ea7ad9', '3aad9b1a-6b65-47de-8357-43737feacfee', 'c4e5c0d9e076698b43b62dc93be917059e954e32aeb8baafc2c1ffa1dd80cff9', 'activated', '2026-10-07 04:05:06.266882+00', '2027-10-07 04:05:06.266882+00', NULL, NULL, '2026-10-07 04:05:06.266882+00', '2026-10-07 04:05:06.266882+00'),
	('5f1f348d-b940-4c02-b255-3ca1e261abc4', '26446bda-000b-444e-b2df-a0fbabbf037d', '47ec4b6b2db3ab8301d357c4a2a3d96c2caa8351684db1edda06153f9acd196e', 'activated', '2026-10-07 04:06:05.578747+00', '2027-10-07 04:06:05.578747+00', NULL, NULL, '2026-10-07 04:06:05.578747+00', '2026-10-07 04:06:05.578747+00'),
	('eb862aec-800c-4076-b4b9-de8377c07e60', 'bac21bfc-0c2c-4361-a9e6-e5f26e69411f', '9e5e611cf0e0f98ef4313ab5a997024c04cbda82d6cec9afe572f745ffe708c7', 'activated', '2026-10-07 04:09:26.036167+00', '2027-10-07 04:09:26.036167+00', NULL, NULL, '2026-10-07 04:09:26.036167+00', '2026-10-07 04:09:26.036167+00'),
	('c1d99584-368e-4346-bcc6-df72aa3ec6cd', '231d9b45-056c-424f-bdb3-95e7fe26c587', '0db88e8eee14d38faba422725bb6619835a61e680ddb02bd3bc74a2d09d7ef53', 'activated', '2026-10-07 04:10:16.238201+00', '2027-10-07 04:10:16.238201+00', NULL, NULL, '2026-10-07 04:10:16.238201+00', '2026-10-07 04:10:16.238201+00'),
	('dec3387a-cc29-444d-8271-dd1e0bccbe57', '24b68869-24b3-4fb3-b232-81801242de5b', '99f11828ce706440ea770420d4b501f41f7609df672722df71d6c896dbd20a4c', 'activated', '2026-10-07 04:11:39.106449+00', '2027-10-07 04:11:39.106449+00', NULL, NULL, '2026-10-07 04:11:39.106449+00', '2026-10-07 04:11:39.106449+00'),
	('d3254528-1c77-4c6d-93b0-34c86d331c94', '9db598d4-c180-40f9-ad53-140ab7855d79', 'c625782fa70548942075af8cffbd4d2b34728d6661d52b3f75c546e7459022aa', 'activated', '2026-10-07 04:12:06.497723+00', '2027-10-07 04:12:06.497723+00', NULL, NULL, '2026-10-07 04:12:06.497723+00', '2026-10-07 04:12:06.497723+00'),
	('a5b7b314-1f28-482d-be96-8530fcdfd6e1', 'be24a027-f44e-4a72-83ea-db20bf2bc109', '9af3f0fe509e91555eb04243b83dc45e4174fdc5e1b1ff975c3b4e5273d4ae2b', 'activated', '2026-10-07 04:12:28.710064+00', '2027-10-07 04:12:28.710064+00', NULL, NULL, '2026-10-07 04:12:28.710064+00', '2026-10-07 04:12:28.710064+00'),
	('100cc40c-0e58-43a1-9ca8-b97486bece5c', 'b1ef5aeb-c79a-495a-8975-a08ca1faf720', '7cbffe1628564d002d4dccbecb93f7104ea2367ccfbba1d62efbc2f3e0c11cd8', 'activated', '2026-10-07 04:12:53.420796+00', '2027-10-07 04:12:53.420796+00', NULL, NULL, '2026-10-07 04:12:53.420796+00', '2026-10-07 04:12:53.420796+00'),
	('79a85a30-3e8b-4e40-b124-81f247781c61', '4762b690-ebe0-4c2b-adb8-c78c79fad3a7', 'dee8825dce047fbe7b4c4694650cb88dd55bc113c8d220b7e362c9e4b31fc3cc', 'inactive', '2026-10-07 04:01:14.396476+00', '2027-10-07 04:01:14.396476+00', '2026-10-07 05:32:07.068671+00', NULL, '2026-10-07 04:01:14.396476+00', '2026-10-07 05:32:07.068671+00'),
	('fccb13c8-7b01-42ef-84fc-80e464a644ac', '9f451c2c-3506-403e-a60a-51d085cd5c14', '6883d29c941e301d654223cd82c14f31ca7fe7c21ac5a5e4414337af70663ba4', 'inactive', '2026-10-07 03:06:32.635076+00', '2027-10-07 03:06:32.635076+00', '2026-10-07 05:44:50.199304+00', NULL, '2026-10-07 03:06:32.635076+00', '2026-10-07 05:44:50.199304+00'),
	('54abcc79-90df-4a5b-a75b-24b031b04359', 'b54813d3-4f04-4849-855e-c13534e266d0', 'd6462634a0763206a314e8c6b9bda498ef579659b8de722075c80f24a406d814', 'inactive', '2026-10-07 03:51:51.027402+00', '2027-10-07 03:51:51.027402+00', '2026-10-07 05:53:49.340619+00', NULL, '2026-10-07 03:51:51.027402+00', '2026-10-07 05:53:49.340619+00'),
	('bba9de39-3baf-4ade-b918-cdd419ab97ac', '9f451c2c-3506-403e-a60a-51d085cd5c14', 'a21df75c1b8a9275e633c577945f676a4823f1f26d641e0035f926ddf79cb52d', 'activated', '2026-10-07 05:50:27.432281+00', '2027-10-07 05:50:27.432281+00', NULL, NULL, '2026-10-07 05:50:27.432281+00', '2026-10-07 05:50:27.432281+00'),
	('88303d4b-b767-4ff1-b61e-1aa316754039', '6a1822b0-597a-4209-9410-debb2317ed73', 'e94918fd59cceb82fde0ac88a71bcdb54d2f14458979e3025783b83f9e713491', 'inactive', '2026-10-07 05:46:20.828881+00', '2027-10-07 05:46:20.828881+00', '2026-10-07 05:51:40.245953+00', NULL, '2026-10-07 05:46:20.828881+00', '2026-10-07 05:51:40.245953+00'),
	('ac63b6d2-16fa-4b41-9bf0-b57418f89807', '6a1822b0-597a-4209-9410-debb2317ed73', '85062ab57ec8ae6196c87257dafef1f8e0ded2db9d8cd5feb29941ae59eeaab1', 'activated', '2026-10-07 05:51:40.245953+00', '2027-10-07 05:51:40.245953+00', NULL, NULL, '2026-10-07 05:51:40.245953+00', '2026-10-07 05:51:40.245953+00'),
	('00aaa0ea-a66c-4abf-91a0-7facf0bef83c', 'b54813d3-4f04-4849-855e-c13534e266d0', 'ce5242725aa1ebb1b9e672b1588fee45b5a26b10c47ad57ce03db1209d4da391', 'activated', '2026-10-07 05:53:49.340619+00', '2027-10-07 05:53:49.340619+00', NULL, NULL, '2026-10-07 05:53:49.340619+00', '2026-10-07 05:53:49.340619+00'),
	('015ddf62-21cc-464b-ac77-bb705e5bc2a4', '4762b690-ebe0-4c2b-adb8-c78c79fad3a7', 'cf6b4cb930abd2fd4932588b19ec2c3a340aa66d80347c66d4e2f5b87f0ef869', 'activated', '2026-10-07 05:55:26.001975+00', '2027-10-07 05:55:26.001975+00', NULL, NULL, '2026-10-07 05:55:26.001975+00', '2026-10-07 05:55:26.001975+00');


--
-- Data for Name: verification_attempts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: attendance_records; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: attendance_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: attendance_request_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."audit_logs" ("id", "actor_user_id", "action", "target_type", "target_id", "metadata", "created_at") VALUES
	('2ede5565-616e-4a69-8817-72e2efc6d5f4', '6b28610b-4d48-48c7-82af-40557d0368c0', 'credential.qr_generated_by_student', 'qr_credential', 'd0e98239-ba50-4949-8a01-b50ac8b2a16d', '{"student_id": "aad11284-90b9-400f-90fc-bbf72e9d933e"}', '2026-10-07 02:38:52.242361+00'),
	('cced3b77-d185-4fab-9fc4-9f9d3e093e40', 'bb42046d-495a-4b7f-95fe-0627b72af878', 'credential.qr_generated_by_student', 'qr_credential', 'd22f55e4-c838-4ffd-85ed-78c3a04642f6', '{"student_id": "251f8c01-b1b2-4c4d-952e-8ece5ef3e8c1"}', '2026-10-07 02:40:16.747687+00'),
	('1235a720-00e3-4c85-884b-8f81c5e56433', '92e99bd4-1e4d-4e24-9ca5-98e94534f9c7', 'credential.qr_generated_by_student', 'qr_credential', '7be499f3-be1b-4cd1-8ef2-92edb0107701', '{"student_id": "a2eac56d-6e08-45df-8c46-69489d890dd1"}', '2026-10-07 02:51:04.371392+00'),
	('8048ffd3-61cd-4847-aefd-8851a0c42ed3', '8f1872df-0743-42b2-abb3-8f67c1ec0d45', 'credential.qr_generated_by_student', 'qr_credential', 'b42442de-ec0a-40e6-9053-92126c2f59a4', '{"student_id": "92548b77-eab1-46fe-9fac-e5fa4de95cda"}', '2026-10-07 02:51:36.601813+00'),
	('2a9c1df1-9671-41af-8dd8-31efa7726fe1', '3faa5a8b-2245-4d45-8896-834ee38ee22e', 'credential.qr_generated_by_student', 'qr_credential', 'baafae16-936b-4563-85b7-87074497f074', '{"student_id": "31f4bf76-7939-44df-acab-6013e1ee1bb3"}', '2026-10-07 02:52:24.103012+00'),
	('309753ad-578f-4e03-adc0-75c7cac10053', 'f3509115-b039-4a28-ad37-fc35e1b93e94', 'credential.qr_generated_by_student', 'qr_credential', 'c8fd13c3-6cd2-4a21-9bfb-e785b7127842', '{"student_id": "47cbda40-8699-4489-87a7-c25e53bc4826"}', '2026-10-07 02:52:56.736582+00'),
	('d5d733c1-b6c4-4c4d-95db-22d87117cc16', '42433484-ac7d-4559-bfcd-0cad2d200285', 'credential.qr_generated_by_student', 'qr_credential', '3a354e72-fcdf-4001-b737-abf60e348568', '{"student_id": "32648e81-4c6e-4bcc-b1f3-624075d83081"}', '2026-10-07 02:53:20.035252+00'),
	('a5afab75-b843-429e-8a78-39d1a415e605', 'd7993839-f3df-4468-8431-4b1cff079a13', 'credential.qr_generated_by_student', 'qr_credential', '3a12024b-60bf-482b-a849-f6ca606049d4', '{"student_id": "ade201f2-4bd3-456b-8640-044ac8f80873"}', '2026-10-07 02:53:53.270822+00'),
	('d0d93faf-2830-43a3-ad91-ad27c3c27f64', '23141c28-f12e-4f8d-9b4c-94ffc5cc0427', 'credential.qr_generated_by_student', 'qr_credential', '5f9a3adb-17c8-483e-935a-81314dc1c9f5', '{"student_id": "84e0a415-cdfe-49bf-8306-6fd8c0af71f2"}', '2026-10-07 02:54:21.863086+00'),
	('424e3f45-14fc-4fc1-b1b2-76eb2295ed39', '46a0fce6-0197-4857-85c7-1c25366d1f1f', 'credential.qr_generated_by_student', 'qr_credential', '87ef4564-5fa6-4289-ac4e-815f9171b154', '{"student_id": "c906cad5-a755-45ec-8070-f612aca4b186"}', '2026-10-07 02:54:49.255201+00'),
	('fb8116f9-4c20-406c-a0f9-56e1efa4e958', 'aa66c537-fade-46e0-97e9-7256ecc56e0b', 'credential.qr_generated_by_student', 'qr_credential', 'c1c15e45-b7c8-4859-9051-1b5300fbaff6', '{"student_id": "076f3ac5-74c5-4d40-96b8-21bf3e95d756"}', '2026-10-07 02:55:19.853846+00'),
	('66c76cba-40ad-4d7b-8548-98cda95b6735', '6e5d25dd-4acb-4ca3-8d62-43edab324749', 'credential.qr_generated_by_student', 'qr_credential', '3640d8e4-2952-49c9-9c59-9dc3f37961e6', '{"student_id": "57e136b5-5d39-49ec-b782-74ff31380685"}', '2026-10-07 02:55:50.565917+00'),
	('be48b293-08d7-4709-96ff-fe971cb29d2b', 'a2b2d013-294e-4dec-9953-54170e806f6a', 'credential.qr_generated_by_student', 'qr_credential', '7482ff63-c177-45de-8b4b-0a2d7ec3af8c', '{"student_id": "0e13f715-e630-411f-b9fc-c5737f684b7e"}', '2026-10-07 02:56:17.994965+00'),
	('7e8579be-b216-401e-aa36-773fc30b64e6', 'd113e0d4-64e2-45a2-a419-0576d0a35af9', 'credential.qr_generated_by_student', 'qr_credential', 'f08d82e9-702b-400f-8653-c76e29c478ad', '{"student_id": "a876eedf-d94f-4bca-a7fc-be30519fc8e0"}', '2026-10-07 02:56:46.632427+00'),
	('1b648408-0987-413b-a764-2524d4cfaf81', 'f5e2b294-6fd4-4a6a-9ba1-a9bfd2072159', 'credential.qr_generated_by_student', 'qr_credential', '42e77f62-286d-4198-a11a-e776fe60b69f', '{"student_id": "0eb3c191-c9cc-4c58-9ff0-1349d0220490"}', '2026-10-07 02:57:17.635074+00'),
	('d6ae0f4d-b915-45e7-9910-ce390e5557cb', '002ed7a8-96ab-4ca5-afaf-fef5932fc6b1', 'credential.qr_generated_by_student', 'qr_credential', '0943f392-4e7b-438d-a4dd-ec0c322cd180', '{"student_id": "c1eb24a5-461d-4616-a80b-822e3ebd6df5"}', '2026-10-07 02:57:48.275657+00'),
	('8fe68096-76a4-4b9a-b588-3e1bdc9d15b6', '454bab49-db39-4cf3-8403-0afafb23f02a', 'credential.qr_generated_by_student', 'qr_credential', 'e536e9d4-e27f-4afd-85f0-43ea8e742792', '{"student_id": "8194b2dc-5f99-4e9b-8d0a-2fe8c0106703"}', '2026-10-07 02:58:27.370166+00'),
	('07fbf334-0aab-4859-ae29-d62d376d7ffe', 'e11359ea-9f97-4ae0-a393-c2c906edbae3', 'credential.qr_generated_by_student', 'qr_credential', 'cd0e3f93-0f71-45eb-b1b3-6c5ceb5ccc95', '{"student_id": "0395d233-bea6-435c-8d22-7afec03b5469"}', '2026-10-07 02:58:50.519489+00'),
	('681bace0-fd56-4c38-8652-833b3c5cc325', '82a6cbe2-8e24-49c5-a4c8-9976f600374f', 'credential.qr_generated_by_student', 'qr_credential', '75b5d6fd-e6f8-497a-97f8-8b4213ae7dcb', '{"student_id": "06230bcd-f6a1-457f-aa71-a51db55140b0"}', '2026-10-07 02:59:14.495408+00'),
	('39367111-41d3-479d-9ea1-1899e5347547', 'a2fec7fc-a29e-41a2-83b1-2155ab025941', 'credential.qr_generated_by_student', 'qr_credential', '87178497-6f36-4f6e-a9f3-d4517c2eb159', '{"student_id": "e70d6026-da51-42c9-894a-dc61956b28ca"}', '2026-10-07 02:59:42.853233+00'),
	('09bb0a7a-af36-4394-925e-18400f47e005', '32018fbb-0e4e-4ddd-b69b-c8a7bee12bea', 'credential.qr_generated_by_student', 'qr_credential', 'c81eda55-f086-4944-b08d-7212d3ed5690', '{"student_id": "1cf85218-4552-402f-8aab-a5b72c7cba09"}', '2026-10-07 03:00:14.889014+00'),
	('7ce6f3d5-616c-462b-ab5c-f2852fcf6146', 'a21501f4-03d2-4b00-83f7-410c3108b736', 'credential.qr_generated_by_student', 'qr_credential', 'd4711fc2-78cd-48e9-b81e-8f4d5aed7d07', '{"student_id": "72f4803b-0475-4094-8d84-07adbef38dae"}', '2026-10-07 03:00:41.344397+00'),
	('ea0b355b-940b-410a-bd2c-18361c5f0ee6', '5662c20f-bccb-44cb-9059-ecf4b6dfade3', 'credential.qr_generated_by_student', 'qr_credential', 'bea3ab8c-2b52-415e-9e1b-88d5906c4fa0', '{"student_id": "91f87633-82e5-4986-a8d3-d9a242d2dcf4"}', '2026-10-07 03:01:07.561476+00'),
	('a096c12c-6888-4485-8019-a5d576b04daf', 'c5f98aab-0ff8-4096-b576-6a15b5f2b455', 'credential.qr_generated_by_student', 'qr_credential', 'bf8a0928-d73f-4fdd-8bac-ce1a37de0fa6', '{"student_id": "7b3a7033-d13e-4fa2-8f40-4bdddb27e5f1"}', '2026-10-07 03:01:36.206161+00'),
	('8658eb5c-3755-450f-9b04-cb87a4826241', '43cd45ee-ee65-4333-b0f3-194163d12abd', 'credential.qr_generated_by_student', 'qr_credential', 'fccb13c8-7b01-42ef-84fc-80e464a644ac', '{"student_id": "9f451c2c-3506-403e-a60a-51d085cd5c14"}', '2026-10-07 03:06:32.635076+00'),
	('b97bc924-43b0-4fd7-bbc2-4cd380fc3a96', '4b9135a2-cedc-4da6-af4c-46391eac7d40', 'credential.qr_generated_by_student', 'qr_credential', '5f7e3ac9-abae-42c4-b900-944b8d6da3f2', '{"student_id": "6edc3952-a039-4bb3-9964-fdad8d02b5b7"}', '2026-10-07 03:06:58.258057+00'),
	('9fe4aa21-b4a1-4ad2-a22d-3ad337f8bdf9', 'fdce43f4-b30f-4d2e-b2a4-a3894f6f15d3', 'credential.qr_generated_by_student', 'qr_credential', '0d03de12-e601-41e3-874e-95250ec760f8', '{"student_id": "0bb1949e-d9df-476d-945b-2f55a1ce04a2"}', '2026-10-07 03:07:26.667665+00'),
	('d86b9397-9f9d-4f6a-9c9b-c3a8837f3935', 'de9138f6-c576-4d2f-aa58-9bd4e9e02b96', 'credential.qr_generated_by_student', 'qr_credential', '73058bf9-98f6-4c28-ac5b-2432325fb368', '{"student_id": "a97f4db9-0ad8-4a2c-8ed5-65f4c1afc293"}', '2026-10-07 03:08:12.419592+00'),
	('15ba9670-7067-449b-bc8b-75f6a9b3511a', 'bda9ddc8-043a-43be-8c19-05e64224e187', 'credential.qr_generated_by_student', 'qr_credential', '93fa0f19-9ab8-41a7-aa7f-c47357eb9cd5', '{"student_id": "ac675a72-d81f-4457-8a64-a5a787373ba6"}', '2026-10-07 03:08:48.291234+00'),
	('97e9786f-5e6e-49a7-bd0e-f93c1a1f8912', 'a2fd6f8c-176e-41c2-98c1-159323b168f4', 'credential.qr_generated_by_student', 'qr_credential', '80a6b998-596a-46f2-a447-53ff0103c119', '{"student_id": "1cab51bf-c482-4658-94fa-0d6dd65b5c57"}', '2026-10-07 03:09:34.068946+00'),
	('b7e515ad-fc9b-4574-8fa7-5fe869282ead', '9f28093a-c6b9-479e-add0-a90ff7635006', 'credential.qr_generated_by_student', 'qr_credential', '1424f394-e72e-4628-bd8a-4afef21d1d5f', '{"student_id": "ee2f9bda-167d-4896-85c0-41f304ca001a"}', '2026-10-07 03:09:57.080188+00'),
	('bf98994c-4cdf-4e95-8c85-7c3da8e99e69', '87df5347-2588-4df6-ba96-3bcbb59b244a', 'credential.qr_generated_by_student', 'qr_credential', '38a37a8b-3e34-465e-b44c-ecd100183328', '{"student_id": "6a1822b0-597a-4209-9410-debb2317ed73"}', '2026-10-07 03:11:24.642073+00'),
	('cf6efd24-b842-4e3e-9166-0f4f8718dfa1', '7e41e735-aa4f-4e95-a18e-ab10a449f8eb', 'credential.qr_generated_by_student', 'qr_credential', '557b1463-1cdf-4dc2-8a44-e9199351452b', '{"student_id": "f185496d-e541-49d3-a516-ddd85ddde6cb"}', '2026-10-07 03:11:51.591904+00'),
	('ec0e60b3-8bf1-4cd6-a747-6a1f540dfb0e', '634ba7cf-ddb7-474a-baea-2fe3c405e023', 'credential.qr_generated_by_student', 'qr_credential', 'cbf65dae-f723-4f26-8c0f-30697508d8f0', '{"student_id": "50482a20-7df8-4fc5-97d8-7745fc407603"}', '2026-10-07 03:12:15.68629+00'),
	('3c529877-b946-4219-863e-532ad3e7e927', '5ad3a140-0973-4892-bba1-c5226492c4eb', 'credential.qr_generated_by_student', 'qr_credential', '66c6ee33-57cb-415f-a0d3-618cefe2f8d7', '{"student_id": "973c4bad-bf09-47d6-bac3-3cbf07a02e4b"}', '2026-10-07 03:12:41.540668+00'),
	('e7763486-0d55-40dc-b5c5-3797d3960c1f', 'c3131ad5-d659-47f1-9563-db2a858cc34e', 'credential.qr_generated_by_student', 'qr_credential', '54fd2ee9-ed08-431b-ab06-ab44fbeb8da4', '{"student_id": "cf2525f3-a55f-4bff-9e34-62ce63f5ab02"}', '2026-10-07 03:13:13.280479+00'),
	('7ca21b62-f5a7-4410-9d3a-9a84baddf143', '94ba54d4-4d0f-4d39-b166-c83c1ae084af', 'credential.qr_generated_by_student', 'qr_credential', '9df86e97-7cfc-43ca-aabd-8240aeed4110', '{"student_id": "e5b0acbc-5b04-4d3a-b2fc-cc761d2ee486"}', '2026-10-07 03:13:38.612438+00'),
	('f995fdf7-4abb-4ecb-ad62-bee4d098d640', '7612e938-015d-45c1-8b00-453ed3b5a018', 'credential.qr_generated_by_student', 'qr_credential', 'ffa830f4-a6c9-4682-93fa-581c8e49a9dc', '{"student_id": "faba7642-9486-465f-a021-75527af482ef"}', '2026-10-07 03:14:07.56637+00'),
	('5bf0de9b-57df-49c9-b803-b5de34e1aeeb', '7861e38c-7c97-4289-b684-e549defb887a', 'credential.qr_generated_by_student', 'qr_credential', 'cc0dcd61-bd74-4274-96b1-723f29063303', '{"student_id": "5af0b2c6-7383-403d-ba0a-33580241705f"}', '2026-10-07 03:14:33.731513+00'),
	('84f3b5fa-ef0d-4f10-9485-5aa9fecd0992', '224ad683-6f5f-4ac2-9a46-9b380abc9b9f', 'credential.qr_generated_by_student', 'qr_credential', '1e6e9923-f972-447f-82c9-f76aa78e7b98', '{"student_id": "e0280976-4572-4df2-8104-5b56fe7356f1"}', '2026-10-07 03:15:03.074378+00'),
	('b8e2dc93-010c-487a-923c-dee38ee2a375', '3438496b-2569-459f-ab01-d1936cfde80c', 'credential.qr_generated_by_student', 'qr_credential', '51e1ea59-8ca3-48af-820a-e52648fdf0bd', '{"student_id": "4f563913-e3cf-4c2b-8f45-43ee3a000c5b"}', '2026-10-07 03:47:58.402253+00'),
	('90d6dde9-93cb-4214-897d-bf8879c80d76', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'Updated Student Details', 'student', NULL, '{"studentId": "26-01195"}', '2026-10-07 04:57:11.394722+00'),
	('04dc4a6a-c961-491e-b746-8f0a29a514a7', '58e32987-9756-4b25-9353-bbff1980410e', 'credential.qr_generated_by_student', 'qr_credential', '2745023c-0582-4a74-8b59-9624c7b6a8f0', '{"student_id": "2e4dae2f-1ef3-4856-9039-954b07478db8"}', '2026-10-07 03:48:29.748373+00'),
	('6334eb48-0909-4af4-8066-da93f733e56b', 'fa017f0c-e797-4ef8-87f7-d7ec99779f5a', 'credential.qr_generated_by_student', 'qr_credential', 'f2b8fc57-58ec-4cda-8892-52fcfdeb697c', '{"student_id": "14027baf-82e6-4f77-a968-03164d09d05f"}', '2026-10-07 03:49:03.977641+00'),
	('91645652-3bc8-466d-8232-d5ced3241e7b', '519b8d95-a005-4b98-8b4e-146cb3dd2fb2', 'credential.qr_generated_by_student', 'qr_credential', 'f1960103-21a8-421c-a2bd-892fe1d81b3b', '{"student_id": "e1c7abf8-4201-4643-8349-3a0768b1c1fa"}', '2026-10-07 03:49:31.627475+00'),
	('993ecd3d-77f1-41ad-9ebe-bd98d0abf80b', '8543d44d-ae42-4788-8e5f-072e70479e99', 'credential.qr_generated_by_student', 'qr_credential', '2e27097b-c70c-4275-aedc-3b23995fbb03', '{"student_id": "d65c938b-c48e-4efe-92fb-73e2664a0d0e"}', '2026-10-07 03:50:03.812939+00'),
	('8e4cbcd5-1ff6-4fb4-ac08-21d68ece058c', '83d39690-0a87-4d03-85e9-2597aae576ac', 'credential.qr_generated_by_student', 'qr_credential', '54abcc79-90df-4a5b-a75b-24b031b04359', '{"student_id": "b54813d3-4f04-4849-855e-c13534e266d0"}', '2026-10-07 03:51:51.027402+00'),
	('2e796127-3b5b-46db-b8b1-6fb024f78cf1', '8b37dd34-c086-4735-ba9d-0778baab0f1e', 'credential.qr_generated_by_student', 'qr_credential', '3335ed38-8c67-46b2-8ef4-b1287d7d10e6', '{"student_id": "38cc575b-8a3f-41fe-8a14-1e0b2a898ee0"}', '2026-10-07 03:52:32.758259+00'),
	('f7dfdeed-34bd-4acc-b4f5-5c0fbd100bcb', 'd2d7b136-a95b-4e7b-ba9d-3640b81c7232', 'credential.qr_generated_by_student', 'qr_credential', '9d9c0df7-b41c-4317-a66c-aca360f705e8', '{"student_id": "7126d136-f2bb-417a-815e-e0581cb4a578"}', '2026-10-07 03:53:01.278266+00'),
	('87614368-960a-4cf2-b8ba-cd5cce8265ad', '5cfc447b-f5c3-4efe-8d77-60b6fc19a4c6', 'credential.qr_generated_by_student', 'qr_credential', '8e84d3d5-fc33-46f3-9734-e08d704c819c', '{"student_id": "8a1fee9e-884c-4789-9514-c06475bf52ef"}', '2026-10-07 03:54:33.199963+00'),
	('f921201b-d557-4ac4-a9eb-bc06f6d57878', 'c1978c2a-3c4b-4699-9b40-84b54b6985c2', 'credential.qr_generated_by_student', 'qr_credential', 'c66fdfa5-5dab-41e5-9310-c31a012b5b8c', '{"student_id": "625df6dd-1843-4ebd-97dc-46e398e74d14"}', '2026-10-07 03:55:18.888339+00'),
	('8ebe92c0-e853-439a-94cb-ab00e7e377d9', 'bc425ab6-0381-49bc-914a-fc12d1a6ac83', 'credential.qr_generated_by_student', 'qr_credential', '4441ebce-6a11-44f4-b7a8-14caedcf4089', '{"student_id": "3bfdd93a-32f9-4be6-b3e7-65aca1de84ba"}', '2026-10-07 03:55:44.754691+00'),
	('a241f5e8-c156-4691-b7c2-992a03a62a58', 'd358c733-f2b0-4b3e-a703-c0f81f381b1a', 'credential.qr_generated_by_student', 'qr_credential', 'fcb7a107-b4eb-4b7e-a537-b4eb4f7fa281', '{"student_id": "8809b492-cae7-4d48-94c6-a2fb20ae5d16"}', '2026-10-07 03:56:48.821842+00'),
	('dc928ab7-9b23-4485-b442-1f32c6a15f73', '7659f51f-4bba-4317-b0bd-17ac8cd78ad9', 'credential.qr_generated_by_student', 'qr_credential', 'cb8125f6-762d-4222-876f-4fd3d06f118b', '{"student_id": "724a18b3-cdc8-4ff1-8317-0914498062e7"}', '2026-10-07 03:58:16.544473+00'),
	('72b3757a-84b5-4f97-8292-46d6b3ca051d', '2df86b71-eafa-4243-80cf-5f70f5ad0838', 'credential.qr_generated_by_student', 'qr_credential', '72c65486-7475-4994-bd23-7eee3f615e1b', '{"student_id": "bd16f16e-ea9c-4809-b7b8-1fd204440acc"}', '2026-10-07 03:58:41.533346+00'),
	('ab17f2b5-97f6-434a-9fd9-616c86215597', '237f4927-ebfc-485e-8455-e9f9f17ca50e', 'credential.qr_generated_by_student', 'qr_credential', '79a85a30-3e8b-4e40-b124-81f247781c61', '{"student_id": "4762b690-ebe0-4c2b-adb8-c78c79fad3a7"}', '2026-10-07 04:01:14.396476+00'),
	('4030b360-a2de-433c-a8f3-3ed24cfca0d9', 'b08dd6a8-6d76-41a1-98f8-872ccc1ddae7', 'credential.qr_generated_by_student', 'qr_credential', 'cbe9540a-361e-48a0-9f7c-361c7ed36c28', '{"student_id": "43d2a101-6d05-4ced-9faa-68cfd878e8c8"}', '2026-10-07 04:01:53.621415+00'),
	('034d0c04-f036-475c-9b77-29c9a6d6103e', '48a87201-8472-4d1c-8a24-c7f67ed2d76d', 'credential.qr_generated_by_student', 'qr_credential', '07a361cc-0637-4118-828e-3adbf6773ea2', '{"student_id": "f2245b1f-ff5f-4507-907c-1d3f6b4ec062"}', '2026-10-07 04:02:20.975687+00'),
	('9ea7ee3f-87ff-4986-ac33-bddeafb53c20', '8a35700e-a311-4e3e-bdbc-a35fe3dd7e2a', 'credential.qr_generated_by_student', 'qr_credential', 'ebac70c7-9fa7-446c-9953-d74c26ad6910', '{"student_id": "59ce746e-c4b9-4234-857f-3eb01f8d7a36"}', '2026-10-07 04:03:16.296264+00'),
	('63b9cd65-2a4f-4331-9785-fddb9fee9410', 'a054dfd8-50f3-4d72-861f-db18783895ba', 'credential.qr_generated_by_student', 'qr_credential', 'bc9ab406-0c99-41d4-a68b-e1ffd84bef2a', '{"student_id": "7d21b4f1-da8b-47d5-8712-45141089721b"}', '2026-10-07 04:03:44.1811+00'),
	('07b282f0-bfb7-4cb2-b4d0-5372802ebbe1', '65a6ad20-9692-4a88-941d-d15715b43fa2', 'credential.qr_generated_by_student', 'qr_credential', '9caf1aff-0d8f-40ce-8952-a362880338b4', '{"student_id": "d5555e52-d80c-4dcf-87db-c70f62c201c9"}', '2026-10-07 04:04:10.991639+00'),
	('7cfc1c4f-719d-4c06-af73-582e309071dd', '12ecfbb5-370b-4baa-afbc-0bb432e5ccb1', 'credential.qr_generated_by_student', 'qr_credential', 'c9eb9249-5daf-49cc-a2fe-6430ce1ee36d', '{"student_id": "dec67357-0c8e-489b-82d3-0bf25cf05842"}', '2026-10-07 04:04:41.322618+00'),
	('4bc5deb6-c3be-45da-87d4-6966bf8e0dc1', '4eda7033-e634-4401-aeee-f705ec6502e0', 'credential.qr_generated_by_student', 'qr_credential', '87dacbc3-e777-40ed-b605-e92960ea7ad9', '{"student_id": "3aad9b1a-6b65-47de-8357-43737feacfee"}', '2026-10-07 04:05:06.266882+00'),
	('69505607-20a9-43f1-8891-9aa16cf35a66', '65b4c3df-dbcd-49ee-9285-28cffe6a5b2d', 'credential.qr_generated_by_student', 'qr_credential', 'f33f007c-6d95-4585-aad2-91770c47802f', '{"student_id": "37fbbe52-d873-42a2-8050-3edbafc00834"}', '2026-10-07 04:05:27.988423+00'),
	('65f345a5-c494-4174-a332-495989b55d72', 'a7037b76-16fe-4a81-ba0b-6a70650c91a5', 'credential.qr_generated_by_student', 'qr_credential', '5f1f348d-b940-4c02-b255-3ca1e261abc4', '{"student_id": "26446bda-000b-444e-b2df-a0fbabbf037d"}', '2026-10-07 04:06:05.578747+00'),
	('732709a7-2653-4076-b8f4-33d7ff04864f', '8c80f94b-501c-4ac8-b22a-754965c32230', 'credential.qr_generated_by_student', 'qr_credential', '2f42ea6f-5890-4ecb-96e2-3ce26efcb2aa', '{"student_id": "ab999222-9389-4f42-80d1-6697683e8241"}', '2026-10-07 04:06:33.431505+00'),
	('79410689-3a64-42a7-9b16-e68fb80bb1ca', 'eb13dc10-d11c-486d-8035-8ecc0d85cb50', 'credential.qr_generated_by_student', 'qr_credential', '41de4107-7abd-49d4-86d4-378f386cc923', '{"student_id": "b6f62fac-65f6-4d35-8312-6b02bec9b76b"}', '2026-10-07 04:07:07.944124+00'),
	('371160f4-3030-4e1a-a47d-da56fa2a3760', 'eff604aa-36df-442a-be05-512579eb5943', 'credential.qr_generated_by_student', 'qr_credential', '760e0705-9c02-4c7f-9730-89e2e3596986', '{"student_id": "a6ad9f34-8425-4236-b013-41d28d9ada00"}', '2026-10-07 04:07:52.656+00'),
	('9f6794ef-7aad-4be3-80df-a03f44fbb6a2', '57151be4-3141-4ed6-8f49-a8cb1c5c4893', 'credential.qr_generated_by_student', 'qr_credential', 'eb862aec-800c-4076-b4b9-de8377c07e60', '{"student_id": "bac21bfc-0c2c-4361-a9e6-e5f26e69411f"}', '2026-10-07 04:09:26.036167+00'),
	('81b464bd-13ca-4091-9134-7afe5ffc6437', 'ad6db960-607e-4e2f-a326-649031739ace', 'credential.qr_generated_by_student', 'qr_credential', 'ad26d407-2b61-46af-95d5-3975cca3cf6d', '{"student_id": "fc64efb4-0416-4e71-be25-fc17330fe972"}', '2026-10-07 04:09:52.596643+00'),
	('8ed52434-e805-4c47-8bae-766400db47a2', '46f59be4-8fa3-40a6-8d44-83418e39df11', 'credential.qr_generated_by_student', 'qr_credential', 'c1d99584-368e-4346-bcc6-df72aa3ec6cd', '{"student_id": "231d9b45-056c-424f-bdb3-95e7fe26c587"}', '2026-10-07 04:10:16.238201+00'),
	('354b4324-7542-4bd8-a083-147a9b2927d8', '57ee444e-43e8-4f87-8c90-f963254b5d31', 'credential.qr_generated_by_student', 'qr_credential', 'b45cdfb2-274d-4a79-aaa1-5138e96cf421', '{"student_id": "becdb11e-ba05-4ca1-b57b-32d989cd6ea6"}', '2026-10-07 04:10:49.413653+00'),
	('558684e4-cae7-4f18-b8e0-c909cf912906', '026c85d0-0b16-49d4-87ad-dd66a095b264', 'credential.qr_generated_by_student', 'qr_credential', 'a669ff62-1cd2-452e-9928-251738e584d1', '{"student_id": "b821d5f7-569f-409b-80fe-0acb67bb2274"}', '2026-10-07 04:11:15.528631+00'),
	('9f205d9f-8078-408a-9ea0-28762ed26db1', '7af364f9-c152-4b01-a79f-fc412c7f19fe', 'credential.qr_generated_by_student', 'qr_credential', 'dec3387a-cc29-444d-8271-dd1e0bccbe57', '{"student_id": "24b68869-24b3-4fb3-b232-81801242de5b"}', '2026-10-07 04:11:39.106449+00'),
	('77252709-be95-415e-b9b6-284d0ee91e53', 'c88bd0a0-330a-4476-b079-2ead88f9a9a5', 'credential.qr_generated_by_student', 'qr_credential', 'd3254528-1c77-4c6d-93b0-34c86d331c94', '{"student_id": "9db598d4-c180-40f9-ad53-140ab7855d79"}', '2026-10-07 04:12:06.497723+00'),
	('d09c2545-759d-43e7-9e6c-1bc6ab4b2339', '7c8163c5-709d-469b-b190-e0ffc12e3dae', 'credential.qr_generated_by_student', 'qr_credential', 'a5b7b314-1f28-482d-be96-8530fcdfd6e1', '{"student_id": "be24a027-f44e-4a72-83ea-db20bf2bc109"}', '2026-10-07 04:12:28.710064+00'),
	('a6e925ed-271e-4538-a873-c43b6f70f6f9', '6234988a-7fba-4a6f-8e68-24e00b392c63', 'credential.qr_generated_by_student', 'qr_credential', '100cc40c-0e58-43a1-9ca8-b97486bece5c', '{"student_id": "b1ef5aeb-c79a-495a-8975-a08ca1faf720"}', '2026-10-07 04:12:53.420796+00'),
	('3dc8a0c9-f480-4c56-9f2a-c2003d503405', '3fedde38-9b31-4427-9fbd-4a17a8deac4f', 'credential.qr_generated_by_student', 'qr_credential', 'e660b150-c9ad-4722-9a94-f31f38f7180c', '{"student_id": "109803d4-d7ff-4f0f-a374-83fc38a401dc"}', '2026-10-07 04:13:24.698528+00'),
	('3984e891-2b6e-4492-909e-2424422aba54', '3799e3b2-4fef-4b00-aebb-6309fceca159', 'credential.qr_generated_by_student', 'qr_credential', '92d89a71-a408-450d-b6cb-67ae9aaa7561', '{"student_id": "79c46da3-0a01-4c5d-a848-631ea8850b04"}', '2026-10-07 04:13:54.186839+00'),
	('57c46f36-baa6-4022-9e2d-88018ffc75cd', 'a129a004-6c54-4e8a-869f-94ac101efac3', 'credential.qr_generated_by_student', 'qr_credential', 'ff38efc8-07d4-4017-8e07-4578d5901298', '{"student_id": "7b3d257f-3610-4573-a0ee-19db554a02b8"}', '2026-10-07 04:15:15.751502+00'),
	('0394a703-c1ec-4ece-b664-c6f8bb92a3e4', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.student_updated', 'student_profile', '83d39690-0a87-4d03-85e9-2597aae576ac', '{"studentId": "b54813d3-4f04-4849-855e-c13534e266d0", "accountStatus": "active"}', '2026-10-07 04:55:40.869313+00'),
	('8f9a3986-bcc4-4bbc-8a27-13d4a801f740', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'Updated Student Details', 'student', NULL, '{"studentId": "26-01257"}', '2026-10-07 04:55:41.245867+00'),
	('54dc9aa1-4761-4eb4-9f74-7884b16c2f56', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.student_updated', 'student_profile', '237f4927-ebfc-485e-8455-e9f9f17ca50e', '{"studentId": "4762b690-ebe0-4c2b-adb8-c78c79fad3a7", "accountStatus": "active"}', '2026-10-07 04:56:13.991618+00'),
	('d042da1d-5e56-44ea-8327-c9016ec195a0', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'Updated Student Details', 'student', NULL, '{"studentId": "26-01309"}', '2026-10-07 04:56:14.318617+00'),
	('9c738d19-13a2-4093-906d-b76227477f97', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.student_updated', 'student_profile', '43cd45ee-ee65-4333-b0f3-194163d12abd', '{"studentId": "9f451c2c-3506-403e-a60a-51d085cd5c14", "accountStatus": "active"}', '2026-10-07 04:56:45.093745+00'),
	('b187952c-df26-4d95-ad8e-015707ece81a', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'Updated Student Details', 'student', NULL, '{"studentId": "26-01193"}', '2026-10-07 04:56:45.416335+00'),
	('d1bebacb-6d4c-4eea-a4ca-8870c3e0a5f0', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.student_updated', 'student_profile', '87df5347-2588-4df6-ba96-3bcbb59b244a', '{"studentId": "6a1822b0-597a-4209-9410-debb2317ed73", "accountStatus": "active"}', '2026-10-07 04:57:11.132225+00'),
	('fe26a7be-becf-4cdc-bd51-6e9d7cfc8614', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.organizer_updated', 'organizer_profile', 'e995fa4a-b8b7-4cf9-9d0d-db7fe60560d3', '{"email": "june.peralta@plpass.edu.ph", "organizerId": "98634940-1cb0-44a6-a83e-608b50babc57", "accountStatus": "active", "employmentStatus": "active"}', '2026-10-07 05:07:06.908473+00'),
	('2ce98c13-d1ca-4723-8d4d-b03fdf253b7f', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.organizer_updated', 'organizer_profile', '907d6a42-43bd-4c7b-879a-44c67f0a7530', '{"email": "organizer@plpass.edu.ph", "organizerId": "885ee6a3-479b-474c-a8bc-e3649d5a04d8", "accountStatus": "active", "employmentStatus": "active"}', '2026-10-07 05:12:24.135713+00'),
	('b2498bf6-8ae8-44a0-8111-5a181751f6e8', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.organizer_updated', 'organizer_profile', '907d6a42-43bd-4c7b-879a-44c67f0a7530', '{"email": "organizer@plpass.edu.ph", "organizerId": "885ee6a3-479b-474c-a8bc-e3649d5a04d8", "accountStatus": "active", "employmentStatus": "active"}', '2026-10-07 05:12:45.831108+00'),
	('7187c4e4-e3d1-40e5-ba8c-5af671f32f96', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', 'd0e6bbbc-14f0-46a8-b249-14340aa59b81', '{"student_id": "4762b690-ebe0-4c2b-adb8-c78c79fad3a7"}', '2026-10-07 05:32:07.068671+00'),
	('97440a5b-6047-460c-8dcc-1ccab79eab32', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', '12651acc-432e-4955-999d-906af2157555', '{"student_id": "9f451c2c-3506-403e-a60a-51d085cd5c14"}', '2026-10-07 05:44:50.199304+00'),
	('07b16ae0-d79f-4e79-81d2-60117dcc47d2', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.status_changed', 'qr_credential', '6a1822b0-597a-4209-9410-debb2317ed73', '{"status": "inactive"}', '2026-10-07 05:45:15.994832+00'),
	('8f76e199-a17e-4af3-9055-1e8220f2462c', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.status_changed', 'qr_credential', '6a1822b0-597a-4209-9410-debb2317ed73', '{"status": "activated"}', '2026-10-07 05:45:23.168519+00'),
	('8140490b-033e-4ac7-878b-bfca9364d016', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', '88303d4b-b767-4ff1-b61e-1aa316754039', '{"student_id": "6a1822b0-597a-4209-9410-debb2317ed73"}', '2026-10-07 05:46:20.828881+00'),
	('31080e36-738f-4df8-898c-68d475067fc9', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', 'bba9de39-3baf-4ade-b918-cdd419ab97ac', '{"student_id": "9f451c2c-3506-403e-a60a-51d085cd5c14"}', '2026-10-07 05:50:27.432281+00'),
	('f2763c38-52f6-491e-b92b-4b2435aec148', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', 'ac63b6d2-16fa-4b41-9bf0-b57418f89807', '{"student_id": "6a1822b0-597a-4209-9410-debb2317ed73"}', '2026-10-07 05:51:40.245953+00'),
	('950ad0d2-e13a-428f-87c9-7629ce3124a1', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', '00aaa0ea-a66c-4abf-91a0-7facf0bef83c', '{"student_id": "b54813d3-4f04-4849-855e-c13534e266d0"}', '2026-10-07 05:53:49.340619+00'),
	('2b1133f0-8d2f-4ee0-9013-3d32ff3c0325', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'credential.qr_issued', 'qr_credential', '015ddf62-21cc-464b-ac77-bb705e5bc2a4', '{"student_id": "4762b690-ebe0-4c2b-adb8-c78c79fad3a7"}', '2026-10-07 05:55:26.001975+00'),
	('94d56172-7b8c-4ed9-b02e-3c98325fe7ac', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '4a3374aa-d7c3-4636-a9b0-7a83e20c3e35', '{"email": "peralta_june@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-002"}', '2026-10-07 06:13:41.260664+00'),
	('c342eb45-2d33-4470-9c3d-c09e081ef00d', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '4bdfc3bd-e881-49e8-9397-cc4f72659b3d', '{"email": "tornea_keithandrea@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-002"}', '2026-10-07 06:31:24.222495+00'),
	('77d60086-94b8-4a60-8f99-c4bee6664550', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '4bdfc3bd-e881-49e8-9397-cc4f72659b3d', '{"email": "tornea_keithandrea@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-002"}', '2026-10-07 06:48:29.412301+00'),
	('7035f280-ed07-411c-b18f-f0018ba4d917', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '4bdfc3bd-e881-49e8-9397-cc4f72659b3d', '{"email": "tornea_keithandrea@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-002"}', '2026-10-07 08:06:49.489891+00'),
	('67514ba2-fee9-4aa7-bc19-3c99759551a6', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '4bdfc3bd-e881-49e8-9397-cc4f72659b3d', '{"email": "tornea_keithandrea@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-003"}', '2026-10-07 08:08:10.257389+00'),
	('35c0b460-339e-4f39-81c9-0ca4f7c8667e', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '18742d61-ad95-48e2-b2c5-a70b02b0c9a2', '{"email": "vargas_rudy@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-004"}', '2026-10-07 08:08:58.849672+00'),
	('eb540dfb-a499-4c06-baa8-05ad7958e6d8', 'b0a3d770-1ef6-4e02-90be-1fc6fb8d62a1', 'user.admin_created', 'user', '93d1ce13-0f86-4668-9c35-b7ebe190af62', '{"email": "goto_ipei@plpasig.edu.ph", "source": "manual", "employeeNumber": "A-005"}', '2026-10-07 08:14:34.680309+00');


--
-- Data for Name: credential_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: credential_request_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_email_outbox; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_feedback; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_objectives; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_feedback_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_feedback_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_feedback_task_objectives; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_participants; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_resources; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: event_summary_snapshots; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: facial_enrollment_history; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: generated_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: legal_acceptances; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."legal_acceptances" ("id", "user_id", "document_type", "document_version", "accepted_at") VALUES
	('ad11bf68-37f3-42a6-a498-c61022b903eb', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'terms', '2026-09-21', '2026-09-21 16:16:40.896782+00'),
	('f261ad1b-89da-424c-92c1-f5e9b19f2fd4', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'privacy', '2026-09-21', '2026-09-21 16:16:40.896782+00'),
	('d6fefcdb-ee91-42df-809a-3f924197afcf', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'terms', '2026-09-21.1', '2026-10-05 01:02:40.78255+00'),
	('fed4e296-621b-42b0-ad5f-d2371ddc8e4c', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'privacy', '2026-09-21.1', '2026-10-05 01:02:40.78255+00'),
	('a496197d-8368-4de1-b336-30c5036240a3', '6b28610b-4d48-48c7-82af-40557d0368c0', 'terms', '2026-09-21.1', '2026-10-07 02:38:44.431309+00'),
	('100a4931-e895-4fdf-8077-55680aca7589', '6b28610b-4d48-48c7-82af-40557d0368c0', 'privacy', '2026-09-21.1', '2026-10-07 02:38:44.431309+00'),
	('60100078-965f-4ab2-b21f-2a3900509aae', 'bb42046d-495a-4b7f-95fe-0627b72af878', 'terms', '2026-09-21.1', '2026-10-07 02:40:13.540543+00'),
	('a90a2884-bc22-4ba2-bc9c-b8bddd3ad583', 'bb42046d-495a-4b7f-95fe-0627b72af878', 'privacy', '2026-09-21.1', '2026-10-07 02:40:13.540543+00'),
	('51953b02-93a6-488c-87f9-3ef252693ad6', '92e99bd4-1e4d-4e24-9ca5-98e94534f9c7', 'terms', '2026-09-21.1', '2026-10-07 02:51:01.592886+00'),
	('9e661a5e-b75e-4feb-a21c-63a2725c2c50', '92e99bd4-1e4d-4e24-9ca5-98e94534f9c7', 'privacy', '2026-09-21.1', '2026-10-07 02:51:01.592886+00'),
	('23df93ed-9748-4993-82c4-4aa56e31db2e', '8f1872df-0743-42b2-abb3-8f67c1ec0d45', 'terms', '2026-09-21.1', '2026-10-07 02:51:33.939271+00'),
	('2ec7dfb5-caaa-4069-9bcd-82a0bd8e1059', '8f1872df-0743-42b2-abb3-8f67c1ec0d45', 'privacy', '2026-09-21.1', '2026-10-07 02:51:33.939271+00'),
	('c776eb9e-18fe-4ead-bf80-2ce27ae08423', '3faa5a8b-2245-4d45-8896-834ee38ee22e', 'terms', '2026-09-21.1', '2026-10-07 02:52:21.743444+00'),
	('2432ccb3-d656-4149-aada-18bff611807f', '3faa5a8b-2245-4d45-8896-834ee38ee22e', 'privacy', '2026-09-21.1', '2026-10-07 02:52:21.743444+00'),
	('6bc192f6-908d-42a7-876b-e7d6265552f2', 'f3509115-b039-4a28-ad37-fc35e1b93e94', 'terms', '2026-09-21.1', '2026-10-07 02:52:54.052521+00'),
	('188e788c-9210-4c0f-9ab5-7e40f52e0708', 'f3509115-b039-4a28-ad37-fc35e1b93e94', 'privacy', '2026-09-21.1', '2026-10-07 02:52:54.052521+00'),
	('ad41d0d0-ba2f-4328-a7e8-513085aada35', '42433484-ac7d-4559-bfcd-0cad2d200285', 'terms', '2026-09-21.1', '2026-10-07 02:53:18.084187+00'),
	('b61f014b-bdf7-47b4-8af3-1ea8ffbde0f7', '42433484-ac7d-4559-bfcd-0cad2d200285', 'privacy', '2026-09-21.1', '2026-10-07 02:53:18.084187+00'),
	('8a340db6-3153-4051-9b77-a9d674a3638d', 'd7993839-f3df-4468-8431-4b1cff079a13', 'terms', '2026-09-21.1', '2026-10-07 02:53:51.004501+00'),
	('3cea59be-52bb-421c-a07b-607e50a0efcb', 'd7993839-f3df-4468-8431-4b1cff079a13', 'privacy', '2026-09-21.1', '2026-10-07 02:53:51.004501+00'),
	('7fd6f7c2-81a9-4c10-9c2b-020d9bfb19c3', '23141c28-f12e-4f8d-9b4c-94ffc5cc0427', 'terms', '2026-09-21.1', '2026-10-07 02:54:20.114382+00'),
	('f1c13617-e5f5-4506-9024-10350579f9ee', '23141c28-f12e-4f8d-9b4c-94ffc5cc0427', 'privacy', '2026-09-21.1', '2026-10-07 02:54:20.114382+00'),
	('dba3fbf4-db64-46a5-8cba-ca04e7370c0d', '46a0fce6-0197-4857-85c7-1c25366d1f1f', 'terms', '2026-09-21.1', '2026-10-07 02:54:47.425265+00'),
	('78c090ef-7626-4ff8-b43f-7f17197d140b', '46a0fce6-0197-4857-85c7-1c25366d1f1f', 'privacy', '2026-09-21.1', '2026-10-07 02:54:47.425265+00'),
	('28ba1f73-ddf0-4336-8099-b5d746a68c5a', 'aa66c537-fade-46e0-97e9-7256ecc56e0b', 'terms', '2026-09-21.1', '2026-10-07 02:55:17.729498+00'),
	('417f86f2-0495-499b-893e-2955730a64c2', 'aa66c537-fade-46e0-97e9-7256ecc56e0b', 'privacy', '2026-09-21.1', '2026-10-07 02:55:17.729498+00'),
	('b7cd84df-7cdc-4724-8d26-2a1a20da6aaa', '6e5d25dd-4acb-4ca3-8d62-43edab324749', 'terms', '2026-09-21.1', '2026-10-07 02:55:48.681906+00'),
	('372f0c6e-5afd-47c0-8ce4-72eb66da3906', '6e5d25dd-4acb-4ca3-8d62-43edab324749', 'privacy', '2026-09-21.1', '2026-10-07 02:55:48.681906+00'),
	('6601a123-a008-4da0-b5c4-6dd0aabf66c8', 'a2b2d013-294e-4dec-9953-54170e806f6a', 'terms', '2026-09-21.1', '2026-10-07 02:56:16.368836+00'),
	('9e0c860d-6409-4ac4-b84e-9b67500a342b', 'a2b2d013-294e-4dec-9953-54170e806f6a', 'privacy', '2026-09-21.1', '2026-10-07 02:56:16.368836+00'),
	('683f3df0-356a-4781-b018-1abdb7e0cf40', 'd113e0d4-64e2-45a2-a419-0576d0a35af9', 'terms', '2026-09-21.1', '2026-10-07 02:56:43.25048+00'),
	('ae8b38fe-a298-46b7-b9e2-815116f564e3', 'd113e0d4-64e2-45a2-a419-0576d0a35af9', 'privacy', '2026-09-21.1', '2026-10-07 02:56:43.25048+00'),
	('cd3eec8e-f539-4a57-8f04-3195fdf9496f', 'f5e2b294-6fd4-4a6a-9ba1-a9bfd2072159', 'terms', '2026-09-21.1', '2026-10-07 02:57:14.431796+00'),
	('02ec244a-3e2a-4b4b-aa1c-eb6e8c9a1dcb', 'f5e2b294-6fd4-4a6a-9ba1-a9bfd2072159', 'privacy', '2026-09-21.1', '2026-10-07 02:57:14.431796+00'),
	('23ffb828-22ca-4f88-9d6e-e4c59c6c2211', '002ed7a8-96ab-4ca5-afaf-fef5932fc6b1', 'terms', '2026-09-21.1', '2026-10-07 02:57:44.46681+00'),
	('f23013fa-a74e-4a65-b361-9f852dcb0db7', '002ed7a8-96ab-4ca5-afaf-fef5932fc6b1', 'privacy', '2026-09-21.1', '2026-10-07 02:57:44.46681+00'),
	('4f095a9c-9839-4be9-b20a-ac2d1473bfbe', '454bab49-db39-4cf3-8403-0afafb23f02a', 'terms', '2026-09-21.1', '2026-10-07 02:58:24.479941+00'),
	('06af8cf9-0003-47fa-8c54-90f30bbfa0d0', '454bab49-db39-4cf3-8403-0afafb23f02a', 'privacy', '2026-09-21.1', '2026-10-07 02:58:24.479941+00'),
	('7670f7be-6a86-4c6b-b007-7bd82fa39c34', 'e11359ea-9f97-4ae0-a393-c2c906edbae3', 'terms', '2026-09-21.1', '2026-10-07 02:58:48.617648+00'),
	('f3ab91d1-f70a-4b9a-9c45-e9c68cc0e0e2', 'e11359ea-9f97-4ae0-a393-c2c906edbae3', 'privacy', '2026-09-21.1', '2026-10-07 02:58:48.617648+00'),
	('dad1ecaa-76b6-4838-9c6b-8e327e46e58b', '82a6cbe2-8e24-49c5-a4c8-9976f600374f', 'terms', '2026-09-21.1', '2026-10-07 02:59:12.936799+00'),
	('bab0c251-ee53-4f4a-a2c3-9043e6745b4c', '82a6cbe2-8e24-49c5-a4c8-9976f600374f', 'privacy', '2026-09-21.1', '2026-10-07 02:59:12.936799+00'),
	('fe4ce757-8381-4f94-a6b0-f9dd320af3e9', 'a2fec7fc-a29e-41a2-83b1-2155ab025941', 'terms', '2026-09-21.1', '2026-10-07 02:59:41.038035+00'),
	('7230f18f-306f-4b71-8e47-bd3e66cfb4a1', 'a2fec7fc-a29e-41a2-83b1-2155ab025941', 'privacy', '2026-09-21.1', '2026-10-07 02:59:41.038035+00'),
	('3a814535-61f4-412d-9ebd-a98e7ee88a34', '32018fbb-0e4e-4ddd-b69b-c8a7bee12bea', 'terms', '2026-09-21.1', '2026-10-07 03:00:12.476574+00'),
	('c75672e6-5deb-4278-b4fc-6ca6906d8343', '32018fbb-0e4e-4ddd-b69b-c8a7bee12bea', 'privacy', '2026-09-21.1', '2026-10-07 03:00:12.476574+00'),
	('50c5a505-01c7-4dff-b6e1-b6ea6c795b77', 'a21501f4-03d2-4b00-83f7-410c3108b736', 'terms', '2026-09-21.1', '2026-10-07 03:00:38.660943+00'),
	('cb3c7586-1357-4cd0-9e1b-00409bcae0e2', 'a21501f4-03d2-4b00-83f7-410c3108b736', 'privacy', '2026-09-21.1', '2026-10-07 03:00:38.660943+00'),
	('ab8ffa0e-f4ac-46c0-90d2-d15650f61455', '5662c20f-bccb-44cb-9059-ecf4b6dfade3', 'terms', '2026-09-21.1', '2026-10-07 03:01:04.981909+00'),
	('5a7e4ff4-6d9e-48c0-83d2-0bd278cd7383', '5662c20f-bccb-44cb-9059-ecf4b6dfade3', 'privacy', '2026-09-21.1', '2026-10-07 03:01:04.981909+00'),
	('6e788c6c-c6c1-4680-8f77-81098519bf08', 'c5f98aab-0ff8-4096-b576-6a15b5f2b455', 'terms', '2026-09-21.1', '2026-10-07 03:01:32.187258+00'),
	('b732b1a7-b3fa-499f-988c-3041800e6042', 'c5f98aab-0ff8-4096-b576-6a15b5f2b455', 'privacy', '2026-09-21.1', '2026-10-07 03:01:32.187258+00'),
	('1dee28b8-a3a0-4159-8c7f-6dd3d1d80514', '43cd45ee-ee65-4333-b0f3-194163d12abd', 'terms', '2026-09-21.1', '2026-10-07 03:06:24.032458+00'),
	('a2d9c6f9-8bf2-4529-8006-e5fb618802f5', '43cd45ee-ee65-4333-b0f3-194163d12abd', 'privacy', '2026-09-21.1', '2026-10-07 03:06:24.032458+00'),
	('8e76d927-29f5-4388-87b7-4c7991f5917d', '4b9135a2-cedc-4da6-af4c-46391eac7d40', 'terms', '2026-09-21.1', '2026-10-07 03:06:56.604663+00'),
	('efaf3911-0024-4fb0-a4c9-7e7dbde7f10a', '4b9135a2-cedc-4da6-af4c-46391eac7d40', 'privacy', '2026-09-21.1', '2026-10-07 03:06:56.604663+00'),
	('34f7a8c1-4ef4-42c7-b39b-6da145489401', 'fdce43f4-b30f-4d2e-b2a4-a3894f6f15d3', 'terms', '2026-09-21.1', '2026-10-07 03:07:25.080049+00'),
	('02c45e98-d08d-4892-9b04-d5c7a2508e2e', 'fdce43f4-b30f-4d2e-b2a4-a3894f6f15d3', 'privacy', '2026-09-21.1', '2026-10-07 03:07:25.080049+00'),
	('1ca034a1-96e7-49d4-ae91-92eb08942d71', 'de9138f6-c576-4d2f-aa58-9bd4e9e02b96', 'terms', '2026-09-21.1', '2026-10-07 03:08:10.97131+00'),
	('e12ef45e-5239-42a9-b220-7d01420e44f8', 'de9138f6-c576-4d2f-aa58-9bd4e9e02b96', 'privacy', '2026-09-21.1', '2026-10-07 03:08:10.97131+00'),
	('1811b629-3eb4-475f-9fa5-940da3f34564', 'bda9ddc8-043a-43be-8c19-05e64224e187', 'terms', '2026-09-21.1', '2026-10-07 03:08:45.902412+00'),
	('7bb8aa24-846f-48f0-b481-dc57dddbb623', 'bda9ddc8-043a-43be-8c19-05e64224e187', 'privacy', '2026-09-21.1', '2026-10-07 03:08:45.902412+00'),
	('2a42fc84-26a5-42f5-ab9a-f19eb6145cc0', 'a2fd6f8c-176e-41c2-98c1-159323b168f4', 'terms', '2026-09-21.1', '2026-10-07 03:09:31.273874+00'),
	('0aeb94cc-250a-41c0-af27-e2cfb8966990', 'a2fd6f8c-176e-41c2-98c1-159323b168f4', 'privacy', '2026-09-21.1', '2026-10-07 03:09:31.273874+00'),
	('e813199a-fc84-411d-9183-ea87c49bd22d', '9f28093a-c6b9-479e-add0-a90ff7635006', 'terms', '2026-09-21.1', '2026-10-07 03:09:55.349438+00'),
	('e3399d82-205e-435d-9978-01ea06a0a9dc', '9f28093a-c6b9-479e-add0-a90ff7635006', 'privacy', '2026-09-21.1', '2026-10-07 03:09:55.349438+00'),
	('638b8621-4fc0-424a-a820-f46e6092b912', '87df5347-2588-4df6-ba96-3bcbb59b244a', 'terms', '2026-09-21.1', '2026-10-07 03:11:22.506476+00'),
	('b9f221e5-7c7f-40df-b046-3b9c65a1e432', '87df5347-2588-4df6-ba96-3bcbb59b244a', 'privacy', '2026-09-21.1', '2026-10-07 03:11:22.506476+00'),
	('dbf012f6-2ffb-4e3b-9325-68c5cff4d60d', '7e41e735-aa4f-4e95-a18e-ab10a449f8eb', 'terms', '2026-09-21.1', '2026-10-07 03:11:50.034655+00'),
	('e7e9e0a6-fd7f-413f-9375-017de137712a', '7e41e735-aa4f-4e95-a18e-ab10a449f8eb', 'privacy', '2026-09-21.1', '2026-10-07 03:11:50.034655+00'),
	('7de3ab3f-d653-4403-a9d4-855cfffc42d3', '634ba7cf-ddb7-474a-baea-2fe3c405e023', 'terms', '2026-09-21.1', '2026-10-07 03:12:13.313184+00'),
	('b0ed1c10-11c5-43dd-b467-6c077345eb5c', '634ba7cf-ddb7-474a-baea-2fe3c405e023', 'privacy', '2026-09-21.1', '2026-10-07 03:12:13.313184+00'),
	('64cfacb2-0098-4613-a92f-2a8e41e9e16d', '5ad3a140-0973-4892-bba1-c5226492c4eb', 'terms', '2026-09-21.1', '2026-10-07 03:12:39.566138+00'),
	('8ae55752-b119-49af-a1b4-e0a2517e99fd', '5ad3a140-0973-4892-bba1-c5226492c4eb', 'privacy', '2026-09-21.1', '2026-10-07 03:12:39.566138+00'),
	('4989b06c-2188-4351-b406-49130c84fb0c', 'c3131ad5-d659-47f1-9563-db2a858cc34e', 'terms', '2026-09-21.1', '2026-10-07 03:13:11.675968+00'),
	('81d532a8-d620-4f02-b3c4-879b1b0189eb', 'c3131ad5-d659-47f1-9563-db2a858cc34e', 'privacy', '2026-09-21.1', '2026-10-07 03:13:11.675968+00'),
	('8b4d6e33-c52d-4261-bf98-c9056a5f17c3', '94ba54d4-4d0f-4d39-b166-c83c1ae084af', 'terms', '2026-09-21.1', '2026-10-07 03:13:36.688057+00'),
	('9766d533-adbb-40a7-be29-0d7c183edeb4', '94ba54d4-4d0f-4d39-b166-c83c1ae084af', 'privacy', '2026-09-21.1', '2026-10-07 03:13:36.688057+00'),
	('aa83e72c-dc52-410c-99e8-3cb3ce3f5a80', '7612e938-015d-45c1-8b00-453ed3b5a018', 'terms', '2026-09-21.1', '2026-10-07 03:14:05.805131+00'),
	('8433c78e-0133-41ae-aebd-fe9cc4c63ef0', '7612e938-015d-45c1-8b00-453ed3b5a018', 'privacy', '2026-09-21.1', '2026-10-07 03:14:05.805131+00'),
	('10aa4925-fe52-4bb6-a7c9-9bf3dade2b36', '7861e38c-7c97-4289-b684-e549defb887a', 'terms', '2026-09-21.1', '2026-10-07 03:14:31.484977+00'),
	('f035dd79-0d8f-41cb-a0fe-17e6e55bfc5b', '7861e38c-7c97-4289-b684-e549defb887a', 'privacy', '2026-09-21.1', '2026-10-07 03:14:31.484977+00'),
	('d945217e-acf9-4861-99e6-c2906bdb3d2c', '224ad683-6f5f-4ac2-9a46-9b380abc9b9f', 'terms', '2026-09-21.1', '2026-10-07 03:15:00.981054+00'),
	('105b0623-a07a-4d3c-a2ed-dabd3454df9e', '224ad683-6f5f-4ac2-9a46-9b380abc9b9f', 'privacy', '2026-09-21.1', '2026-10-07 03:15:00.981054+00'),
	('619b5820-4637-47e6-a0fb-5fc60ce8638b', '3438496b-2569-459f-ab01-d1936cfde80c', 'terms', '2026-09-21.1', '2026-10-07 03:47:56.223054+00'),
	('66b3abe9-ea5b-4c2d-b65f-16d82c9fc540', '3438496b-2569-459f-ab01-d1936cfde80c', 'privacy', '2026-09-21.1', '2026-10-07 03:47:56.223054+00'),
	('5fe69553-d971-4407-af9d-452b3f81be74', '58e32987-9756-4b25-9353-bbff1980410e', 'terms', '2026-09-21.1', '2026-10-07 03:48:27.97423+00'),
	('c6a2c3ee-000a-4279-bf38-d036a557398a', '58e32987-9756-4b25-9353-bbff1980410e', 'privacy', '2026-09-21.1', '2026-10-07 03:48:27.97423+00'),
	('dd925287-d471-4e23-92df-00727792ec72', 'fa017f0c-e797-4ef8-87f7-d7ec99779f5a', 'terms', '2026-09-21.1', '2026-10-07 03:49:01.423039+00'),
	('fa360adb-9a13-4173-a1cb-f8627093b9b7', 'fa017f0c-e797-4ef8-87f7-d7ec99779f5a', 'privacy', '2026-09-21.1', '2026-10-07 03:49:01.423039+00'),
	('9bdf864e-34e2-4c5b-856d-e30b1cb3cc1a', '519b8d95-a005-4b98-8b4e-146cb3dd2fb2', 'terms', '2026-09-21.1', '2026-10-07 03:49:29.633258+00'),
	('581d3722-7337-485b-99f7-2766e3afd298', '519b8d95-a005-4b98-8b4e-146cb3dd2fb2', 'privacy', '2026-09-21.1', '2026-10-07 03:49:29.633258+00'),
	('11d90f21-aeda-4889-8de7-6ad1aa6a5ab5', '8543d44d-ae42-4788-8e5f-072e70479e99', 'terms', '2026-09-21.1', '2026-10-07 03:50:02.386844+00'),
	('00699ab1-755e-458a-8c16-a98ccbcf5e6f', '8543d44d-ae42-4788-8e5f-072e70479e99', 'privacy', '2026-09-21.1', '2026-10-07 03:50:02.386844+00'),
	('0cd2ec22-0f8c-476e-a00d-e853623adc01', '83d39690-0a87-4d03-85e9-2597aae576ac', 'terms', '2026-09-21.1', '2026-10-07 03:51:48.792068+00'),
	('f6e54b57-2f22-4579-8db9-705e1b4d8ce8', '83d39690-0a87-4d03-85e9-2597aae576ac', 'privacy', '2026-09-21.1', '2026-10-07 03:51:48.792068+00'),
	('aeff24e0-abcd-47c7-ba16-4f97ef351871', '8b37dd34-c086-4735-ba9d-0778baab0f1e', 'terms', '2026-09-21.1', '2026-10-07 03:52:30.660299+00'),
	('91e9cb0e-9112-4f39-8bc4-faedc63bbe23', '8b37dd34-c086-4735-ba9d-0778baab0f1e', 'privacy', '2026-09-21.1', '2026-10-07 03:52:30.660299+00'),
	('bfaee24f-96c1-48c1-a604-ee33bb8a357b', 'd2d7b136-a95b-4e7b-ba9d-3640b81c7232', 'terms', '2026-09-21.1', '2026-10-07 03:52:58.990409+00'),
	('36fcbc18-a235-460f-a60e-e775297069cd', 'd2d7b136-a95b-4e7b-ba9d-3640b81c7232', 'privacy', '2026-09-21.1', '2026-10-07 03:52:58.990409+00'),
	('4913d3fc-9376-4b6f-a369-60da19095104', '5cfc447b-f5c3-4efe-8d77-60b6fc19a4c6', 'terms', '2026-09-21.1', '2026-10-07 03:54:31.120695+00'),
	('5c4db1ca-0ead-443c-8668-032de0333f2f', '5cfc447b-f5c3-4efe-8d77-60b6fc19a4c6', 'privacy', '2026-09-21.1', '2026-10-07 03:54:31.120695+00'),
	('b23859a2-8afc-4b38-b3cc-05e007ca0922', 'c1978c2a-3c4b-4699-9b40-84b54b6985c2', 'terms', '2026-09-21.1', '2026-10-07 03:55:16.944295+00'),
	('db531c3a-f8a0-445e-86a6-bb166f9c1c0a', 'c1978c2a-3c4b-4699-9b40-84b54b6985c2', 'privacy', '2026-09-21.1', '2026-10-07 03:55:16.944295+00'),
	('e8cc8fab-e3f9-482f-adcd-713c89111389', 'bc425ab6-0381-49bc-914a-fc12d1a6ac83', 'terms', '2026-09-21.1', '2026-10-07 03:55:42.383549+00'),
	('11cfc40c-c9a1-4198-82e0-ff07c3f27317', 'bc425ab6-0381-49bc-914a-fc12d1a6ac83', 'privacy', '2026-09-21.1', '2026-10-07 03:55:42.383549+00'),
	('e6899949-43f5-4868-9928-9294be54618d', 'd358c733-f2b0-4b3e-a703-c0f81f381b1a', 'terms', '2026-09-21.1', '2026-10-07 03:56:47.203726+00'),
	('4ae0d11f-2490-49b2-9959-eed14c425064', 'd358c733-f2b0-4b3e-a703-c0f81f381b1a', 'privacy', '2026-09-21.1', '2026-10-07 03:56:47.203726+00'),
	('0bae7055-fa1b-49df-b7fc-d4a848d8e412', '7659f51f-4bba-4317-b0bd-17ac8cd78ad9', 'terms', '2026-09-21.1', '2026-10-07 03:58:15.011536+00'),
	('0d7cd64c-9c2b-4fe1-9237-a3e1d0509dd7', '7659f51f-4bba-4317-b0bd-17ac8cd78ad9', 'privacy', '2026-09-21.1', '2026-10-07 03:58:15.011536+00'),
	('942c5d9b-ce5d-4347-aa02-4684765e2074', '2df86b71-eafa-4243-80cf-5f70f5ad0838', 'terms', '2026-09-21.1', '2026-10-07 03:58:40.309097+00'),
	('3c2ec90a-e0f2-4e06-a5a7-eb6dda687ff8', '2df86b71-eafa-4243-80cf-5f70f5ad0838', 'privacy', '2026-09-21.1', '2026-10-07 03:58:40.309097+00'),
	('e8619163-7d73-4792-9710-444487ce196e', '237f4927-ebfc-485e-8455-e9f9f17ca50e', 'terms', '2026-09-21.1', '2026-10-07 04:01:13.023002+00'),
	('cabcd1cb-3d75-42ec-9a24-fa0f4e05aa0f', '237f4927-ebfc-485e-8455-e9f9f17ca50e', 'privacy', '2026-09-21.1', '2026-10-07 04:01:13.023002+00'),
	('1c19ad2d-5d0b-4c1e-8dc5-6fa795c404a5', 'b08dd6a8-6d76-41a1-98f8-872ccc1ddae7', 'terms', '2026-09-21.1', '2026-10-07 04:01:52.229242+00'),
	('5908936a-869b-41d0-8213-3b014e79ae83', 'b08dd6a8-6d76-41a1-98f8-872ccc1ddae7', 'privacy', '2026-09-21.1', '2026-10-07 04:01:52.229242+00'),
	('9a16fa70-aacd-4ce9-9bc4-94ddaccd3c64', '48a87201-8472-4d1c-8a24-c7f67ed2d76d', 'terms', '2026-09-21.1', '2026-10-07 04:02:18.619074+00'),
	('c0cb5b80-99d4-4e56-b0d7-b5f868fd6148', '48a87201-8472-4d1c-8a24-c7f67ed2d76d', 'privacy', '2026-09-21.1', '2026-10-07 04:02:18.619074+00'),
	('f4ef1602-e6cb-43f3-aea8-c3075b71db49', '8a35700e-a311-4e3e-bdbc-a35fe3dd7e2a', 'terms', '2026-09-21.1', '2026-10-07 04:03:14.647505+00'),
	('251d1f15-8456-4902-8f2f-f860e4dee267', '8a35700e-a311-4e3e-bdbc-a35fe3dd7e2a', 'privacy', '2026-09-21.1', '2026-10-07 04:03:14.647505+00'),
	('7152564a-db1f-475e-bc8a-71f958e33d51', 'a054dfd8-50f3-4d72-861f-db18783895ba', 'terms', '2026-09-21.1', '2026-10-07 04:03:42.498953+00'),
	('b0298c2b-4b63-40b8-aeb5-b7a987b280bb', 'a054dfd8-50f3-4d72-861f-db18783895ba', 'privacy', '2026-09-21.1', '2026-10-07 04:03:42.498953+00'),
	('734973dc-0706-464e-98b8-3007b62caf6d', '65a6ad20-9692-4a88-941d-d15715b43fa2', 'terms', '2026-09-21.1', '2026-10-07 04:04:07.238895+00'),
	('be0f0491-3e4a-4eb7-94eb-89e517181936', '65a6ad20-9692-4a88-941d-d15715b43fa2', 'privacy', '2026-09-21.1', '2026-10-07 04:04:07.238895+00'),
	('b62e6f24-7952-40f7-bd3f-ff0524c0858e', '12ecfbb5-370b-4baa-afbc-0bb432e5ccb1', 'terms', '2026-09-21.1', '2026-10-07 04:04:39.572679+00'),
	('db19d334-86bb-42af-b2c2-a39b678764ca', '12ecfbb5-370b-4baa-afbc-0bb432e5ccb1', 'privacy', '2026-09-21.1', '2026-10-07 04:04:39.572679+00'),
	('b307d2d7-b96f-46d9-ada5-9894ac4e63de', '4eda7033-e634-4401-aeee-f705ec6502e0', 'terms', '2026-09-21.1', '2026-10-07 04:05:04.832285+00'),
	('8892e4f5-ca4d-4cbf-8d40-4f375a79c3ab', '4eda7033-e634-4401-aeee-f705ec6502e0', 'privacy', '2026-09-21.1', '2026-10-07 04:05:04.832285+00'),
	('684bece3-c4c2-42a0-8712-a4e7f50c4050', '65b4c3df-dbcd-49ee-9285-28cffe6a5b2d', 'terms', '2026-09-21.1', '2026-10-07 04:05:26.469921+00'),
	('108aa62f-fb3c-4e75-9368-5b61f6dc683a', '65b4c3df-dbcd-49ee-9285-28cffe6a5b2d', 'privacy', '2026-09-21.1', '2026-10-07 04:05:26.469921+00'),
	('ec3bfc7e-3df0-4b32-b7a6-f3cc57548910', 'a7037b76-16fe-4a81-ba0b-6a70650c91a5', 'terms', '2026-09-21.1', '2026-10-07 04:06:03.342631+00'),
	('7c33a1c0-a83c-46ad-8f56-7883427fd5de', 'a7037b76-16fe-4a81-ba0b-6a70650c91a5', 'privacy', '2026-09-21.1', '2026-10-07 04:06:03.342631+00'),
	('7706392e-a2eb-469c-b6de-bb2fc38e415d', '8c80f94b-501c-4ac8-b22a-754965c32230', 'terms', '2026-09-21.1', '2026-10-07 04:06:31.049754+00'),
	('c5c09672-82bf-4bcf-8ebf-d833b98fb8f8', '8c80f94b-501c-4ac8-b22a-754965c32230', 'privacy', '2026-09-21.1', '2026-10-07 04:06:31.049754+00'),
	('df14abce-7a76-43eb-b69f-385bf75179fd', 'eb13dc10-d11c-486d-8035-8ecc0d85cb50', 'terms', '2026-09-21.1', '2026-10-07 04:07:05.794899+00'),
	('dd440394-96a4-408f-b223-8cc35cd91728', 'eb13dc10-d11c-486d-8035-8ecc0d85cb50', 'privacy', '2026-09-21.1', '2026-10-07 04:07:05.794899+00'),
	('f836af1b-a195-4fc1-bb78-ee9e8cc52de9', 'eff604aa-36df-442a-be05-512579eb5943', 'terms', '2026-09-21.1', '2026-10-07 04:07:50.836285+00'),
	('515a4ed1-70c3-4447-8d14-48777f26b10d', 'eff604aa-36df-442a-be05-512579eb5943', 'privacy', '2026-09-21.1', '2026-10-07 04:07:50.836285+00'),
	('d3f6406b-063f-4706-8990-4458fc73bcee', '57151be4-3141-4ed6-8f49-a8cb1c5c4893', 'terms', '2026-09-21.1', '2026-10-07 04:09:24.428265+00'),
	('12e1329a-0190-40ff-9ed6-fb0c286e7a5c', '57151be4-3141-4ed6-8f49-a8cb1c5c4893', 'privacy', '2026-09-21.1', '2026-10-07 04:09:24.428265+00'),
	('b19cf750-cffb-47a8-977a-1787375a6c2e', 'ad6db960-607e-4e2f-a326-649031739ace', 'terms', '2026-09-21.1', '2026-10-07 04:09:50.882405+00'),
	('481fa424-1d1d-4d29-87bd-a1ad48ffc0ad', 'ad6db960-607e-4e2f-a326-649031739ace', 'privacy', '2026-09-21.1', '2026-10-07 04:09:50.882405+00'),
	('0edf64bd-cc81-407d-a610-647d1a5b5ad1', '46f59be4-8fa3-40a6-8d44-83418e39df11', 'terms', '2026-09-21.1', '2026-10-07 04:10:14.842779+00'),
	('50e25a13-aeec-41e9-85e1-f640ac47e9ce', '46f59be4-8fa3-40a6-8d44-83418e39df11', 'privacy', '2026-09-21.1', '2026-10-07 04:10:14.842779+00'),
	('450f03d5-d2b1-49f7-8024-211237da377f', '57ee444e-43e8-4f87-8c90-f963254b5d31', 'terms', '2026-09-21.1', '2026-10-07 04:10:48.006216+00'),
	('3c89923a-c0ba-4626-8d96-40fc151ec1a0', '57ee444e-43e8-4f87-8c90-f963254b5d31', 'privacy', '2026-09-21.1', '2026-10-07 04:10:48.006216+00'),
	('cef2cd6e-b485-4a0a-b5b5-42e74f38fab9', '026c85d0-0b16-49d4-87ad-dd66a095b264', 'terms', '2026-09-21.1', '2026-10-07 04:11:14.019772+00'),
	('dad04da2-507c-439c-a91b-9f5b09ae9e01', '026c85d0-0b16-49d4-87ad-dd66a095b264', 'privacy', '2026-09-21.1', '2026-10-07 04:11:14.019772+00'),
	('d37db43e-ff4f-480c-b8af-d48406444f1d', '7af364f9-c152-4b01-a79f-fc412c7f19fe', 'terms', '2026-09-21.1', '2026-10-07 04:11:37.683757+00'),
	('c3c16af6-338b-4609-b843-9f550224e923', '7af364f9-c152-4b01-a79f-fc412c7f19fe', 'privacy', '2026-09-21.1', '2026-10-07 04:11:37.683757+00'),
	('00f5d1b6-a519-46a6-8505-b27b1ccae48c', 'c88bd0a0-330a-4476-b079-2ead88f9a9a5', 'terms', '2026-09-21.1', '2026-10-07 04:12:04.090081+00'),
	('6199b546-0864-497c-aa2e-1a82c16cc171', 'c88bd0a0-330a-4476-b079-2ead88f9a9a5', 'privacy', '2026-09-21.1', '2026-10-07 04:12:04.090081+00'),
	('583726c5-4622-4f28-870f-d8a6fb7f5bdd', '7c8163c5-709d-469b-b190-e0ffc12e3dae', 'terms', '2026-09-21.1', '2026-10-07 04:12:26.555033+00'),
	('509418e7-333b-4cac-90b9-e02039545354', '7c8163c5-709d-469b-b190-e0ffc12e3dae', 'privacy', '2026-09-21.1', '2026-10-07 04:12:26.555033+00'),
	('0f9a6b65-6f17-4de4-a74f-4e9bdf4fdbd0', '6234988a-7fba-4a6f-8e68-24e00b392c63', 'terms', '2026-09-21.1', '2026-10-07 04:12:52.189883+00'),
	('ac4223aa-e878-429c-9c1d-6dcb7f82a4e2', '6234988a-7fba-4a6f-8e68-24e00b392c63', 'privacy', '2026-09-21.1', '2026-10-07 04:12:52.189883+00'),
	('25a28a4d-0f57-4332-bd28-300b834b2063', '3fedde38-9b31-4427-9fbd-4a17a8deac4f', 'terms', '2026-09-21.1', '2026-10-07 04:13:22.798687+00'),
	('4757dd5f-e20a-4038-b085-254927a3289a', '3fedde38-9b31-4427-9fbd-4a17a8deac4f', 'privacy', '2026-09-21.1', '2026-10-07 04:13:22.798687+00'),
	('5f9d1b86-7a11-4b83-ba59-5b8720dc3aa1', '3799e3b2-4fef-4b00-aebb-6309fceca159', 'terms', '2026-09-21.1', '2026-10-07 04:13:52.840001+00'),
	('1e7cea44-623e-4c2c-a7f1-50909adddd6b', '3799e3b2-4fef-4b00-aebb-6309fceca159', 'privacy', '2026-09-21.1', '2026-10-07 04:13:52.840001+00'),
	('3234d93f-8a12-46e0-a175-6eed7733ed09', 'a129a004-6c54-4e8a-869f-94ac101efac3', 'terms', '2026-09-21.1', '2026-10-07 04:15:12.810852+00'),
	('1e484fc8-42f3-4ad8-b34a-a115ce39b869', 'a129a004-6c54-4e8a-869f-94ac101efac3', 'privacy', '2026-09-21.1', '2026-10-07 04:15:12.810852+00');


--
-- Data for Name: legal_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."legal_documents" ("id", "document_type", "sections", "version", "published_at", "updated_by", "updated_at") VALUES
	('f395ab29-4044-4d99-b50d-64f6dd6cfaed', 'terms', '[{"body": "Use only your assigned PLPass account, keep your credentials private, and report suspected compromise promptly. Account details must remain accurate enough for attendance support.", "heading": "Account responsibility"}, {"body": "Use PLPass for legitimate school attendance and request workflows. Do not probe, bypass, scrape, impersonate another student, or interfere with the service or another person’s records.", "heading": "Acceptable use"}, {"body": "Check in only for yourself and only through the verification method provided for the event. Sharing QR credentials, asking another person to check in, or attempting to alter a record outside the correction process is not permitted.", "heading": "Attendance integrity"}, {"body": "QR and facial verification may be offered by an event organizer. Use the Request History, Correction Requests, or Report an Issue tools when a credential, event, or attendance record needs review.", "heading": "Verification and requests"}, {"body": "PLPass may be unavailable or limited during maintenance, connectivity problems, or an event-system issue. A submitted request or report is not a guarantee of approval or attendance correction.", "heading": "Service availability"}, {"body": "Access may be limited or suspended when necessary to protect the service, investigate suspected misuse, or follow institutional instructions. The institution’s established support and review channels remain available.", "heading": "Account action"}, {"body": "The institution may update these terms as the service or its rules change. The current version and effective date are always available from the sign-in page and your Profile.", "heading": "Updates"}, {"body": "This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption.", "heading": "Review status"}]', '2026-09-21.1', '2026-09-30 06:39:06.503063+00', NULL, '2026-09-30 06:39:06.503063+00'),
	('404d79c7-2089-46d1-b1c4-ec5dda9095e0', 'privacy', '[{"body": "PLPass uses account and student details, event participation, attendance records, correction and issue requests, device/session information needed for security, and notification status to provide the student workspace.", "heading": "Information used by PLPass"}, {"body": "When enabled for an event, QR credentials and facial-verification enrollment or matching data may be used to verify attendance. Facial enrollment is separate from general Terms and Privacy acceptance and is handled through the institution’s credential process.", "heading": "Verification data"}, {"body": "The information supports attendance recording, event participation, request review, credential support, account security, auditability, service reliability, and communications about your PLPass activity.", "heading": "Why it is used"}, {"body": "Access is limited by role and institutional permissions. Students see their own account, attendance, and request information; authorized organizers and administrators may see the records needed for their assigned responsibilities.", "heading": "Who can access it"}, {"body": "PLPass uses authenticated access, role-aware database policies, protected storage, and audit controls appropriate to the application. No system can promise that every service or network is risk-free.", "heading": "Security and storage"}, {"body": "Records are retained and disposed of according to the institution’s approved records, attendance, and privacy requirements. This page does not invent a retention period; contact the institution for the governing schedule.", "heading": "Retention"}, {"body": "You may review your visible records and use the correction or issue-reporting workflows when something is inaccurate. Privacy questions, access requests, or concerns should be directed to the institution’s designated support or privacy office.", "heading": "Your choices and rights"}, {"body": "The current version and effective date are shown here. Material changes should be communicated through the institution’s normal student channels and reflected in the policy shown in PLPass.", "heading": "Policy updates"}, {"body": "This student-facing text is a PLPass product draft and must be reviewed and approved by the institution and its legal/privacy officers before production adoption.", "heading": "Review status"}]', '2026-09-21.1', '2026-09-30 06:39:06.503063+00', NULL, '2026-09-30 06:39:06.503063+00');


--
-- Data for Name: ml_predictions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notification_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."notification_preferences" ("profile_id", "preferences", "updated_at") VALUES
	('907d6a42-43bd-4c7b-879a-44c67f0a7530', '{"reports": true, "reminders": true, "eventUpdates": true}', '2026-10-04 16:52:00.049513+00');


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."notifications" ("id", "recipient_id", "notification_type", "title", "message", "notification_status", "action_url", "reference_id", "read_at", "created_at", "notification_code", "severity", "requires_action", "related_type", "dedupe_key") VALUES
	('a271468e-5f41-4827-857b-4ea4a8abecc5', '34e0cdf3-da8e-432f-9e8e-82eadba8514c', 'system', 'Account status updated', 'Your PLPass account status is now inactive.', 'unread', NULL, '34e0cdf3-da8e-432f-9e8e-82eadba8514c', NULL, '2026-09-24 12:49:20.203999+00', 'account.status_changed', 'warning', false, 'profile', 'account-status:34e0cdf3-da8e-432f-9e8e-82eadba8514c:inactive:2026-09-18 09:13:59.372633+00'),
	('68c39799-a5a1-4e05-a819-0fe3035ecd1d', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'correction', 'Request status updated', 'Your attendance correction request is now rejected.', 'read', NULL, NULL, '2026-10-05 01:03:02.963+00', '2026-09-21 18:47:44.352263+00', 'correction.updated', 'info', false, NULL, NULL),
	('5a5dd251-57d2-40ad-a67c-03d8cbc95815', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'system', 'Account status updated', 'Your PLPass account status is now active.', 'read', NULL, '5b9fb8b3-65ca-45c0-a86c-227905df45c4', '2026-10-05 01:03:02.963+00', '2026-09-24 12:39:40.152727+00', 'account.status_changed', 'info', false, 'profile', 'account-status:5b9fb8b3-65ca-45c0-a86c-227905df45c4:active:2026-09-21 14:35:30.006425+00'),
	('b03e2dc7-f6b1-467c-9851-7c54a1f63e1a', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'system', 'Account status updated', 'Your PLPass account status is now inactive.', 'read', NULL, '5b9fb8b3-65ca-45c0-a86c-227905df45c4', '2026-10-05 01:03:02.963+00', '2026-09-24 12:39:19.827938+00', 'account.status_changed', 'warning', false, 'profile', 'account-status:5b9fb8b3-65ca-45c0-a86c-227905df45c4:inactive:2026-09-21 14:35:30.006425+00');


--
-- Data for Name: request_email_outbox; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."request_email_outbox" ("id", "recipient_profile_id", "recipient_email", "request_table", "request_id", "request_status", "subject", "body", "delivery_status", "provider_message_id", "error_message", "created_at", "sent_at", "attempt_count", "next_attempt_at", "processing_started_at", "processing_token", "last_attempt_at") VALUES
	('d023fdb5-7d91-4028-bf33-678a8609a5b1', '5b9fb8b3-65ca-45c0-a86c-227905df45c4', 'faustino_justineangelo@plpasig.edu.ph', 'attendance_requests', 'ba2fd929-6a5d-4d47-970e-d3d27ed9724e', 'rejected', 'PLPass request update: Rejected', 'Your present request has been marked as rejected.

Organizer note: Rejected. Original attendance status retained.', 'sent', '<202609211848.20590292206@smtp-relay.mailin.fr>', NULL, '2026-09-21 18:47:44.352263+00', '2026-09-21 18:48:03.059747+00', 1, '2026-09-21 18:47:44.352263+00', NULL, NULL, '2026-09-21 18:48:02.181715+00');


--
-- Data for Name: semesters; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."semesters" ("id", "semester_name", "academic_year", "start_date", "end_date", "status", "created_at", "updated_at") VALUES
	('82a39720-46e0-4451-98b1-7e34060c7608', '1st Semester', '2025-2026', '2025-08-01', '2025-12-20', 'completed', '2026-08-08 07:38:00.622097+00', '2026-08-08 07:38:00.622097+00'),
	('bd1bd5bd-d389-43de-975e-3c4b6ed9175d', '2nd Semester', '2025-2026', '2026-01-05', '2026-05-30', 'active', '2026-08-08 07:38:00.622097+00', '2026-08-08 07:38:00.622097+00'),
	('426a9189-1b44-4ab4-a352-542d457cba30', 'Midyear', '2025-2026', '2026-06-01', '2026-07-31', 'upcoming', '2026-08-08 07:38:00.622097+00', '2026-08-08 07:38:00.622097+00'),
	('823dd835-8f08-4f98-a167-e5a4026e6440', 'First Semester', '2026-2027', '2026-06-01', '2026-10-31', 'upcoming', '2026-09-23 16:24:25.438581+00', '2026-09-23 16:24:25.438581+00'),
	('715cd52f-65fc-49c2-9b28-d4a8b7591e82', 'Midyear Semester', '2026-2027', '2026-11-01', '2027-01-31', 'upcoming', '2026-09-23 16:24:25.438581+00', '2026-09-23 16:24:25.438581+00'),
	('e134a58e-58f3-45a0-973d-57452ae53fbf', 'Second Semester', '2026-2027', '2027-02-01', '2027-06-30', 'upcoming', '2026-09-23 16:24:25.438581+00', '2026-09-23 16:24:25.438581+00');


--
-- Data for Name: student_face_embeddings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."system_settings" ("id", "institution_name", "current_school_year", "current_semester_id", "attendance_late_cutoff_minutes", "default_session_duration_minutes", "verification_policy", "notification_preferences", "updated_by", "created_at", "updated_at") VALUES
	('78e35126-b2fe-4eba-8391-c652be78a01c', 'Pamantasan ng Lungsod ng Pasig', '2026-2027', '823dd835-8f08-4f98-a167-e5a4026e6440', 15, 90, 'Use an approved QR reader or facial verification device.', '{"readerPolicy": "Use an approved QR reader or facial verification device.", "autoCancelAfterMinutes": 720, "automaticAbsentMarking": true, "credentialStatusPolicy": "Blocked and lost credentials require administrator review.", "noStartReminderMinutes": 60, "notificationEventsEnabled": true, "participantInvitationMode": "both", "requireCancellationReason": true, "allowedVerificationMethods": ["qr", "facial"], "notificationRemindersEnabled": true, "minimumTimeOutIntervalMinutes": 15, "sensitiveActionReasonRequired": true, "notificationCorrectionsEnabled": true, "notificationCredentialsEnabled": true, "allowAttendanceAfterScheduledEnd": true, "notificationPreferencePlaceholder": "Notifications are sent for important attendance and account updates."}', NULL, '2026-09-13 16:21:51.599836+00', '2026-09-25 01:03:13.779198+00');


--
-- PostgreSQL database dump complete
--

-- \unrestrict s8jh63RCFoScIElcyJbQM1Vhy5v3tvaj7TMndZYZX5Ae9a4UvrI3IRGhnPD7v3V

RESET ALL;
